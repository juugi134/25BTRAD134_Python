from core.synthetic_data import generate_scenario
from core.baseline import greedy_schedule
import core.scheduler as scheduler_module
from core.scheduler import optimize_schedule
from core.constraints import schedule_preflight, verify_schedule
from core.analytics import compare_schedules

def setup():
    data,cfg=generate_scenario(8,19);cfg['days']=4;cfg['max_seconds']=3
    return data,cfg

def test_optimizer_valid_schedule():
    data,cfg=setup();result=optimize_schedule(data,cfg)
    assert result['status'] in ('FEASIBLE','OPTIMAL','HEURISTIC_FEASIBLE')
    assert len(result['assignments'])==8
    assert result['violations']==[]
    assert verify_schedule(data['scenes'],cfg,result['assignments'])==[]
def test_baseline_respects_same_constraints():
    data,cfg=setup();base=greedy_schedule(data['scenes'],cfg);optimized=optimize_schedule(data,cfg)
    assert base['status']=='FEASIBLE'
    assert compare_schedules(base,optimized)['comparable']
def test_infeasible_precheck_when_actor_blocked():
    data,cfg=setup();cid=data['scenes'][0]['character_ids'][0]
    cfg['actor_blocks']={str(cid):[{'day':d,'start':0,'end':cfg['slots_per_day']} for d in range(cfg['days'])]}
    result=optimize_schedule(data,cfg)
    assert result['status']=='INFEASIBLE'
    assert 'no available start time' in result['message']

def test_preflight_reports_capacity_and_calendar_blockers():
    scenes=[
        {'scene_id':1,'script_order':1,'duration_slots':2,'character_ids':[1],'location_id':1},
        {'scene_id':2,'script_order':2,'duration_slots':2,'character_ids':[2],'location_id':2},
    ]
    cfg={'days':1,'slots_per_day':3,'actor_blocks':{},'location_blocks':{}}
    result=schedule_preflight(scenes,cfg)
    assert result['status']=='NEEDS_ATTENTION'
    assert result['required_slots']==4
    assert result['capacity_slots']==3
    assert result['minimum_days']==2
    assert [issue['type'] for issue in result['issues']]==['capacity']
    optimized=optimize_schedule({'scenes':scenes},cfg)
    assert optimized['status']=='INFEASIBLE'
    assert optimized['method']=='Precheck'
    assert 'calendar provides only' in optimized['message']

def test_preflight_reports_scene_limit_and_minimum_days():
    scenes=[
        {'scene_id':i,'script_order':i,'duration_slots':1,'character_ids':[],'location_id':1}
        for i in range(1,6)
    ]
    cfg={'days':2,'slots_per_day':4,'max_scenes_per_day':2,'actor_blocks':{},'location_blocks':{}}
    result=schedule_preflight(scenes,cfg)
    assert result['status']=='NEEDS_ATTENTION'
    assert result['minimum_days']==3
    assert [issue['type'] for issue in result['issues']]==['scene_count_capacity']
    assert 'allows only 4 scenes across 2 days' in result['issues'][0]['message']
    optimized=optimize_schedule({'scenes':scenes},cfg)
    assert optimized['status']=='INFEASIBLE'
    assert 'scenes per day' in optimized['message']

def test_scene_limit_is_enforced_by_optimizer_and_baseline():
    data,cfg=setup()
    cfg['max_scenes_per_day']=2
    baseline=greedy_schedule(data['scenes'],cfg)
    optimized=optimize_schedule(data,cfg)
    assert baseline['status']=='FEASIBLE'
    assert optimized['status'] in ('FEASIBLE','OPTIMAL','HEURISTIC_FEASIBLE')
    for result in (baseline,optimized):
        counts={}
        for assignment in result['assignments']:
            counts[assignment['day']]=counts.get(assignment['day'],0)+1
        assert counts and max(counts.values())<=2
        assert verify_schedule(data['scenes'],cfg,result['assignments'])==[]

def test_schedule_verifier_detects_daily_scene_limit_violation():
    scenes=[
        {'scene_id':i,'script_order':i,'duration_slots':1,'character_ids':[],'location_id':1}
        for i in range(1,4)
    ]
    cfg={'days':2,'slots_per_day':4,'max_scenes_per_day':2,'actor_blocks':{},'location_blocks':{}}
    assignments=[
        {'scene_id':i,'day':0,'start_slot':i-1,'end_slot':i,'location_id':1}
        for i in range(1,4)
    ]
    violations=verify_schedule(scenes,cfg,assignments)
    assert any('Maximum of 2 scenes per day exceeded' in message for message in violations)

def test_preflight_identifies_scene_with_no_allowed_position():
    scenes=[{'scene_id':1,'script_order':7,'duration_slots':2,'character_ids':[1],'location_id':1}]
    cfg={'days':1,'slots_per_day':4,'actor_blocks':{'1':[{'day':0,'start':0,'end':4}]},'location_blocks':{}}
    result=schedule_preflight(scenes,cfg)
    assert result['status']=='NEEDS_ATTENTION'
    assert result['issues'][0]['scene_order']==7
    assert 'no available start time' in result['issues'][0]['message']

def test_preflight_explains_scene_longer_than_workday():
    scenes=[{'scene_id':1,'script_order':3,'duration_slots':5,'character_ids':[],'location_id':1}]
    cfg={'days':2,'slots_per_day':4,'actor_blocks':{},'location_blocks':{}}
    result=schedule_preflight(scenes,cfg)
    assert result['status']=='NEEDS_ATTENTION'
    assert 'needs 2.5 hours' in result['issues'][0]['message']
def test_replanning_after_actor_unavailable():
    data,cfg=setup();original=optimize_schedule(data,cfg)
    a=original['assignments'][0];scene=next(s for s in data['scenes'] if s['scene_id']==a['scene_id'])
    cid=scene['character_ids'][0]
    cfg['actor_blocks']={str(cid):[{'day':a['day'],'start':0,'end':cfg['slots_per_day']}]}
    revised=optimize_schedule(data,cfg,prior_schedule=original)
    assert revised['status'] in ('FEASIBLE','OPTIMAL','HEURISTIC_FEASIBLE')
    assert revised['violations']==[]
    new=next(x for x in revised['assignments'] if x['scene_id']==a['scene_id'])
    assert new['day']!=a['day']
    assert revised['metrics']['moved_scenes']>=1
def test_overlap_detector():
    data,cfg=setup();a=[]
    for s in data['scenes']:
        a.append({'scene_id':s['scene_id'],'day':0,'start_slot':0,'end_slot':s['duration_slots'],'location_id':s['location_id']})
    assert any('overlap' in msg.lower() for msg in verify_schedule(data['scenes'],cfg,a))

def test_unknown_optimizer_returns_constraint_respecting_first_fit(monkeypatch):
    import sys
    data,cfg=setup()
    scene=data['scenes'][0]
    character_id=scene['character_ids'][0]
    cfg['actor_blocks']={str(character_id):[{'day':0,'start':0,'end':2}]}
    monkeypatch.setitem(sys.modules,'ortools',None)
    monkeypatch.setattr(scheduler_module,'_milp',lambda *args:{
        'status':'UNKNOWN','method':'SciPy HiGHS MILP','assignments':[],'metrics':{},
        'elapsed_ms':100,'violations':[],'message':'Time limit reached.',
    })
    result=optimize_schedule(data,cfg)
    assert result['status']=='HEURISTIC_FEASIBLE'
    assert result['method']=='Constraint-aware first-fit fallback'
    assert len(result['assignments'])==len(data['scenes'])
    assert verify_schedule(data['scenes'],cfg,result['assignments'])==[]
    first=next(item for item in result['assignments'] if item['scene_id']==scene['scene_id'])
    assert first['day']!=0 or first['start_slot']>=2
