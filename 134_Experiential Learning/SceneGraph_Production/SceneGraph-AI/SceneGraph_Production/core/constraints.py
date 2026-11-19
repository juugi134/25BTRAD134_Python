"""Hard constraints: single crew, one assignment per scene, valid calendars, fixed durations."""
from math import ceil

MAX_PRODUCTION_DAYS=60


def validate_config(scenes,cfg):
    if not scenes:raise ValueError('At least one scene is required')
    days=cfg['days'];spd=cfg['slots_per_day']
    if not (1<=days<=MAX_PRODUCTION_DAYS and 2<=spd<=24):raise ValueError('Invalid production calendar')
    max_scenes=cfg.get('max_scenes_per_day')
    if max_scenes is not None and (type(max_scenes) is not int or not 1<=max_scenes<=24):
        raise ValueError('Maximum scenes per day must be between 1 and 24.')
    ids=[s['scene_id'] for s in scenes]
    if len(set(ids))!=len(ids):raise ValueError('Duplicate scene IDs')
    if any(s['duration_slots']<1 for s in scenes):raise ValueError('Scene durations must be positive')

def allowed(scene,day,start,cfg):
    end=start+scene['duration_slots']
    if not 0<=day<cfg['days'] or not 0<=start<end<=cfg['slots_per_day']:return False
    for cid in scene['character_ids']:
        for b in cfg.get('actor_blocks',{}).get(str(cid),[]):
            if b['day']==day and start<b['end'] and end>b['start']:return False
    for b in cfg.get('location_blocks',{}).get(str(scene['location_id']),[]):
        if b['day']==day and start<b['end'] and end>b['start']:return False
    return True

def candidates(scene,cfg):
    dur=scene['duration_slots'];return [(d,s) for d in range(cfg['days']) for s in range(cfg['slots_per_day']-dur+1) if allowed(scene,d,s,cfg)]


def schedule_preflight(scenes,cfg,placements=None):
    days=cfg['days'];slots_per_day=cfg['slots_per_day']
    required_slots=sum(scene['duration_slots'] for scene in scenes)
    capacity_slots=days*slots_per_day
    issues=[]
    max_scenes=cfg.get('max_scenes_per_day')
    for scene in scenes:
        scene_slots=scene['duration_slots']
        positions=(placements or {}).get(scene['scene_id'])
        if positions is None:
            positions=candidates(scene,cfg)
        if not positions:
            if scene_slots>slots_per_day:
                message=f"Scene {scene['script_order']} needs {scene_slots/2:g} hours, longer than the {slots_per_day/2:g}-hour workday."
            else:
                message=f"Scene {scene['script_order']} has no available start time under the current availability constraints."
            issues.append({'type':'scene_unavailable','scene_order':scene['script_order'],'message':message})
    if required_slots>capacity_slots:
        issues.append({
            'type':'capacity',
            'scene_order':None,
            'message':f'The scenes need {required_slots/2:g} crew-hours, but the calendar provides only {capacity_slots/2:g}.',
        })
    if max_scenes is not None and len(scenes)>days*max_scenes:
        issues.append({
            'type':'scene_count_capacity',
            'scene_order':None,
            'message':f'The limit of {max_scenes} scenes per day allows only {days*max_scenes} scenes across {days} days.',
        })
    minimum_days=max(ceil(required_slots/slots_per_day),ceil(len(scenes)/max_scenes) if max_scenes else 1)
    return {
        'status':'NEEDS_ATTENTION' if issues else 'READY_TO_OPTIMIZE',
        'scene_count':len(scenes),
        'required_slots':required_slots,
        'capacity_slots':capacity_slots,
        'minimum_days':minimum_days,
        'issues':issues,
    }


def verify_schedule(scenes,cfg,assignments):
    expected={s['scene_id']:s for s in scenes};seen=set();occupied=set();daily_counts={};violations=[]
    for a in assignments:
        sid=a['scene_id'];s=expected.get(sid)
        if not s:violations.append(f'Unknown scene {sid}');continue
        if sid in seen:violations.append(f'Scene {sid} assigned twice')
        seen.add(sid)
        day=a['day'];start=a['start_slot'];end=a['end_slot']
        daily_counts[day]=daily_counts.get(day,0)+1
        if end!=start+s['duration_slots'] or not allowed(s,day,start,cfg):violations.append(f'Scene {sid} violates availability/duration')
        for t in range(start,end):
            key=(day,t)
            if key in occupied:violations.append(f'Crew overlap on day {day+1}, slot {t}')
            occupied.add(key)
    max_scenes=cfg.get('max_scenes_per_day')
    if max_scenes is not None:
        for day,count in daily_counts.items():
            if count>max_scenes:
                violations.append(f'Maximum of {max_scenes} scenes per day exceeded on day {day+1}')
    if seen!=set(expected):violations.append('Missing scene assignments')
    return sorted(set(violations))

def schedule_metrics(assignments,prior=None):
    ordered=sorted(assignments,key=lambda a:(a['day'],a['start_slot']))
    days=len({a['day'] for a in ordered});changes=0
    for a,b in zip(ordered,ordered[1:]):
        if a['day']==b['day'] and a['location_id']!=b['location_id']:changes+=1
    old={a['scene_id']:(a['day'],a['start_slot']) for a in (prior or [])}
    moved=sum(old.get(a['scene_id']) not in (None,(a['day'],a['start_slot'])) for a in ordered)
    return {'production_days':days,'last_day':(max([a['day'] for a in ordered],default=-1)+1),'location_changes':changes,'moved_scenes':moved,'total_scenes':len(ordered)}
