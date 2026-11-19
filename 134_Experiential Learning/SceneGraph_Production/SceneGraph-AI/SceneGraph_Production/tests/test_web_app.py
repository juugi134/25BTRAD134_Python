from __future__ import annotations
from io import BytesIO
from pathlib import Path
from reportlab.pdfgen.canvas import Canvas
import app as app_module


def first_project(client, headers):
    r=client.get('/api/projects',headers=headers)
    assert r.status_code==200
    projects = r.json()['projects']
    if not projects:
        demo = (Path('data') / 'sample_script.fountain').read_text(encoding='utf8')
        cr = client.post('/api/import', headers=headers, json={'title': 'Test Production', 'text': demo})
        return cr.json()['state']['id']
    return projects[0]['id']


def test_home_and_health(client):
    home=client.get('/')
    assert home.status_code==200
    assert 'SCENEGRAPH' in home.text
    assert 'CONTINUE WITH GOOGLE' in home.text
    assert 'http://127.0.0.1:8000/' in home.text
    assert 'This file page cannot connect to the sign-in API.' in Path('docs/app.js').read_text(encoding='utf-8')
    assert 'function hasBackendConnection(){return Boolean(API_BASE)||(!isGithubPages&&location.protocol!==\'file:\')}' in Path('docs/app.js').read_text(encoding='utf-8')
    assert client.get('/config.js').status_code==200
    assert 'no-cache' in client.get('/app.js').headers['cache-control']
    assert client.get('/api/health').json()['ok'] is True
    assert client.get('/etc/passwd').status_code==404


def test_login_protected(client):
    assert client.get('/api/projects').status_code==401
    assert client.post('/api/schedule',json={'project_id':1}).status_code==401
    assert client.post('/api/schedule/assignment',json={'project_id':1}).status_code==401
    assert client.post('/api/estimate-durations',json={'project_id':1}).status_code==401
    assert client.get('/api/export?project_id=1&format=json').status_code==401


def test_registration_validation(client):
    result=client.post('/api/auth/register',json={'display_name':'Jane','email':'invalid','password':'a'*11})
    assert result.status_code==400
    result=client.post('/api/auth/register',json={'display_name':'Jane','email':'jane@example.test','password':'short'})
    assert result.status_code==400


def test_login_logout(client,alice):
    invalid=client.post('/api/auth/login',json={'email':'alice@example.test','password':'wrong'})
    assert invalid.status_code==401
    right=client.post('/api/auth/login',json={'email':'alice@example.test','password':'MyStrongPass2026!'})
    assert right.status_code==200
    assert client.get('/api/auth/me',headers=alice).json()['display_name']=='Alice Camera'
    assert client.post('/api/auth/logout',headers=alice).status_code==200
    assert client.get('/api/auth/me',headers=alice).status_code==401


def test_google_login_uses_verified_email_for_existing_account(client,alice,monkeypatch):
    original=client.get('/api/auth/me',headers=alice).json()
    monkeypatch.setenv('GOOGLE_CLIENT_ID','test-client-id')
    monkeypatch.setattr(app_module,'verify_google_id_token',lambda credential:{
        'email':'alice@example.test','email_verified':True,'name':'Alice from Google',
    })
    result=client.post('/api/auth/google',json={'credential':'test-google-token'})
    assert result.status_code==200,result.text
    assert result.json()['user']['id']==original['id']
    assert result.json()['user']['email']==original['email']
    assert len(client.get('/api/projects',headers={'Authorization':'Bearer '+result.json()['token']}).json()['projects'])==0


def test_google_login_rejects_unverified_email(client,monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID','test-client-id')
    monkeypatch.setattr(app_module,'verify_google_id_token',lambda credential:{
        'email':'unverified@example.test','email_verified':False,'name':'Unverified',
    })
    result=client.post('/api/auth/google',json={'credential':'test-google-token'})
    assert result.status_code==401


def test_google_login_creates_account_for_new_verified_email(client,monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID','test-client-id')
    monkeypatch.setattr(app_module,'verify_google_id_token',lambda credential:{
        'email':'new.google@example.test','email_verified':True,'name':'New Google User',
    })
    result=client.post('/api/auth/google',json={'credential':'test-google-token'})
    assert result.status_code==200,result.text
    assert result.json()['user']['email']=='new.google@example.test'
    assert result.json()['user']['display_name']=='New Google User'
    assert len(client.get('/api/projects',headers={'Authorization':'Bearer '+result.json()['token']}).json()['projects'])==0


def test_google_login_with_firebase_account(client,monkeypatch):
    monkeypatch.setenv('FIREBASE_PROJECT_ID','fir-c-e-n-e-g-r-a-p-h')
    monkeypatch.setattr(app_module,'verify_google_id_token',lambda credential:{
        'email':'firebase.user@example.test','email_verified':True,'name':'Firebase User',
    })
    result=client.post('/api/auth/google',json={'credential':'test-firebase-id-token'})
    assert result.status_code==200,result.text
    assert result.json()['user']['email']=='firebase.user@example.test'
    assert result.json()['user']['display_name']=='Firebase User'
    assert len(client.get('/api/projects',headers={'Authorization':'Bearer '+result.json()['token']}).json()['projects'])==0


def test_auth_config_returns_firebase_settings(client,monkeypatch):
    monkeypatch.setenv('FIREBASE_PROJECT_ID','fir-c-e-n-e-g-r-a-p-h')
    monkeypatch.setenv('FIREBASE_API_KEY','test-api-key')
    res=client.get('/api/auth/config')
    assert res.status_code==200
    cfg=res.json()
    assert cfg['firebase_config'] is not None
    assert cfg['firebase_config']['projectId']=='fir-c-e-n-e-g-r-a-p-h'
    assert cfg['firebase_config']['apiKey']=='test-api-key'



def test_phone_otp_links_existing_account_and_signs_in(client,alice,bob,monkeypatch):
    number='+14155552671'
    sent=[]
    monkeypatch.setenv('TWILIO_ACCOUNT_SID','ACtest')
    monkeypatch.setenv('TWILIO_AUTH_TOKEN','test-token')
    monkeypatch.setenv('TWILIO_VERIFY_SERVICE_SID','VAtest')
    monkeypatch.setattr(app_module,'start_phone_verification',lambda value:sent.append(value))
    monkeypatch.setattr(app_module,'check_phone_verification',lambda value,code:value==number and code=='123456')
    sent_result=client.post('/api/auth/phone/link/send',headers=alice,json={'phone_number':number})
    assert sent_result.status_code==200,sent_result.text
    linked=client.post('/api/auth/phone/link/verify',headers=alice,json={'phone_number':number,'code':'123456'})
    assert linked.status_code==200,linked.text
    assert linked.json()['phone_number']==number
    assert client.get('/api/auth/me',headers=alice).json()['phone_number']==number
    conflict=client.post('/api/auth/phone/link/send',headers=bob,json={'phone_number':number})
    assert conflict.status_code==409
    login_send=client.post('/api/auth/phone/send',json={'phone_number':number})
    assert login_send.status_code==200
    assert sent==[number,number]
    login=client.post('/api/auth/phone/verify',json={'phone_number':number,'code':'123456'})
    assert login.status_code==200,login.text
    assert login.json()['user']['phone_number']==number


def test_phone_otp_rejects_invalid_international_number(client):
    result=client.post('/api/auth/phone/send',json={'phone_number':'4155552671'})
    assert result.status_code==400


def test_new_account_has_sample_with_real_sql_data(client,alice):
    pid=first_project(client,alice)
    state=client.get('/api/state',params={'project_id':pid},headers=alice).json()
    assert len(state['scenes'])==12
    assert len(state['characters'])>=3
    assert state['graph']['nodes']
    assert state['settings']['days']==3
    assert state['settings']['slots_per_day']==16
    assert state['default_schedule_config']['estimated_days']==3
    assert len(state['default_schedule']['assignments'])==12
    assert state['schedule_preflight']['status']=='READY_TO_OPTIMIZE'
    assert state['schedule_preflight']['scene_count']==12
    assert not state['schedule_stale']

def test_scene_limit_persists_and_increases_recommended_days(client,alice):
    pid=first_project(client,alice)
    state=client.get('/api/state',params={'project_id':pid},headers=alice).json()
    settings=state['settings']
    settings['max_scenes_per_day']=2
    response=client.post('/api/settings',headers=alice,json={'project_id':pid,'settings':settings})
    assert response.status_code==200,response.text
    updated=response.json()['state']
    assert updated['settings']['max_scenes_per_day']==2
    assert updated['default_schedule_config']['estimated_days']>=6
    assert updated['schedule_preflight']['minimum_days']>=6
    assert len(updated['default_schedule']['assignments'])==12
    counts={}
    for assignment in updated['default_schedule']['assignments']:
        counts[assignment['day']]=counts.get(assignment['day'],0)+1
    assert max(counts.values())<=2

    settings=updated['settings']
    settings['max_scenes_per_day']=2.5
    invalid=client.post('/api/settings',headers=alice,json={'project_id':pid,'settings':settings})
    assert invalid.status_code==400


def test_account_isolation(client,alice,bob):
    a=first_project(client,alice)
    b=first_project(client,bob)
    assert a!=b
    assert client.get('/api/state',params={'project_id':a},headers=bob).status_code==400
    assert client.post('/api/schedule',headers=bob,json={'project_id':a}).status_code==400
    assert client.get('/api/export',params={'project_id':a,'format':'json'},headers=bob).status_code==400
    assert client.delete('/api/projects/'+str(a),headers=bob).status_code==400
    assert client.get('/api/state',params={'project_id':a},headers=alice).status_code==200


def test_scheduling_replanning_staleness_and_exports(client,alice):
    pid=first_project(client,alice)
    rs=client.post('/api/schedule',headers=alice,json={'project_id':pid})
    assert rs.status_code==200,rs.text
    state=rs.json()['state'];opt=state['schedules']['optimized']
    assert opt['status'] in {'OPTIMAL','FEASIBLE','HEURISTIC_FEASIBLE'}
    assert opt['violations']==[]
    assert len(opt['assignments'])==12
    assert client.get('/api/export',params={'project_id':pid,'format':'csv'},headers=alice).status_code==200
    assert client.get('/api/export',params={'project_id':pid,'format':'pdf'},headers=alice).content.startswith(b'%PDF')
    assert client.get('/api/export',params={'project_id':pid,'format':'json'},headers=alice).json()['id']==pid
    chosen=opt['assignments'][0]
    sid=chosen['scene_id']; day=chosen['day']
    scene=next(s for s in state['scenes'] if s['scene_id']==sid)
    if scene['character_ids']:
        key=str(scene['character_ids'][0]);blocks=state['settings']['actor_blocks'];blocks[key]=[{'day':day,'start':0,'end':state['settings']['slots_per_day']}]
    else:
        key=str(scene['location_id']);blocks=state['settings']['location_blocks'];blocks[key]=[{'day':day,'start':0,'end':state['settings']['slots_per_day']}]
    change=client.post('/api/settings',headers=alice,json={'project_id':pid,'settings':state['settings']})
    assert change.status_code==200,change.text
    assert change.json()['state']['schedule_stale']
    assert client.get('/api/export',params={'project_id':pid,'format':'csv'},headers=alice).status_code==409
    replan=client.post('/api/schedule',headers=alice,json={'project_id':pid,'replan':True})
    assert replan.status_code==200,replan.text
    result=replan.json()['state']
    assert not result['schedule_stale']
    assert result['schedules']['optimized']['violations']==[]
    new_assign=next(a for a in result['schedules']['optimized']['assignments'] if a['scene_id']==sid)
    assert new_assign['day']!=day

def test_manual_schedule_edit_persists_and_rejects_conflicts(client,alice):
    pid=first_project(client,alice)
    state=client.get('/api/state',params={'project_id':pid},headers=alice).json()
    settings=state['settings']
    settings['days']+=1
    extended=client.post('/api/settings',headers=alice,json={'project_id':pid,'settings':settings})
    assert extended.status_code==200,extended.text
    scheduled=client.post('/api/schedule',headers=alice,json={'project_id':pid})
    assert scheduled.status_code==200,scheduled.text
    state=scheduled.json()['state']
    optimized=state['schedules']['optimized']
    assignments=optimized['assignments']
    target=assignments[0]
    scene=next(item for item in state['scenes'] if item['scene_id']==target['scene_id'])
    next_placement=None
    for day in range(state['settings']['days']):
        for start in range(state['settings']['slots_per_day']-scene['duration_slots']+1):
            if (day,start)==(target['day'],target['start_slot']):
                continue
            overlaps=any(
                item['scene_id']!=target['scene_id']
                and item['day']==day
                and item['start_slot']<start+scene['duration_slots']
                and item['end_slot']>start
                for item in assignments
            )
            if not overlaps:
                next_placement=(day,start)
                break
        if next_placement:
            break
    assert next_placement is not None
    day,start=next_placement
    moved=client.post('/api/schedule/assignment',headers=alice,json={
        'project_id':pid,'scene_id':target['scene_id'],'day':day,'start_slot':start,
    })
    assert moved.status_code==200,moved.text
    result=moved.json()['state']
    edited=result['schedules']['optimized']
    assert edited['method']=='Manually adjusted schedule'
    saved=next(a for a in edited['assignments'] if a['scene_id']==target['scene_id'])
    assert (saved['day'],saved['start_slot'])==(day,start)
    assert edited['status']=='FEASIBLE'
    assert edited['violations']==[]
    assert not result['schedule_stale']

    other=next(a for a in result['schedules']['optimized']['assignments'] if a['scene_id']!=target['scene_id'])
    conflict=client.post('/api/schedule/assignment',headers=alice,json={
        'project_id':pid,'scene_id':target['scene_id'],'day':other['day'],'start_slot':other['start_slot'],
    })
    assert conflict.status_code==400
    latest=client.get('/api/state',params={'project_id':pid},headers=alice).json()
    unchanged=next(a for a in latest['schedules']['optimized']['assignments'] if a['scene_id']==target['scene_id'])
    assert (unchanged['day'],unchanged['start_slot'])==(day,start)


def test_edit_persists_and_fails_safe(client,alice):
    pid=first_project(client,alice)
    state=client.get('/api/state',params={'project_id':pid},headers=alice).json()
    scene=state['scenes'][0]
    res=client.post('/api/scene',headers=alice,json={'project_id':pid,'scene_id':scene['scene_id'], 'changes':{'duration_slots':3}})
    assert res.status_code==200,res.text
    assert client.get('/api/state',params={'project_id':pid},headers=alice).json()['scenes'][0]['duration_slots']==3
    assert client.post('/api/scene',headers=alice,json={'project_id':pid,'scene_id':scene['scene_id'], 'changes':{'duration_slots':0}}).status_code==400


def test_reestimating_existing_scene_times_marks_schedule_stale(client,alice):
    pid=first_project(client,alice)
    state=client.get('/api/state',params={'project_id':pid},headers=alice).json()
    scene=state['scenes'][0]
    changed=client.post('/api/scene',headers=alice,json={
        'project_id':pid,'scene_id':scene['scene_id'],'changes':{'duration_slots':1},
    })
    assert changed.status_code==200,changed.text
    scheduled=client.post('/api/schedule',headers=alice,json={'project_id':pid})
    assert scheduled.status_code==200,scheduled.text
    assert not scheduled.json()['state']['schedule_stale']

    estimated=client.post('/api/estimate-durations',headers=alice,json={'project_id':pid})
    assert estimated.status_code==200,estimated.text
    result=estimated.json()
    assert result['updated_scenes']==1
    assert result['state']['scenes'][0]['duration_slots']==3
    assert result['state']['schedule_stale']


def test_import_graph_events_and_delete(client,alice):
    script='INT. LIBRARY - DAY\n\nMIRA\nWhere is it?\n\nEXT. PARK - NIGHT\n\nARI\nI lost it.\n\nINT. LIBRARY - NIGHT\n\nMIRA\nIt was here.\n'
    res=client.post('/api/import',headers=alice,json={'title':'Second Production','text':script})
    assert res.status_code==200,res.text
    data=res.json()['state'];pid=data['id'];assert len(data['scenes'])==3
    events=[(data['scenes'][0]['scene_id'],'ACQUIRE'),(data['scenes'][1]['scene_id'],'LOSE'),(data['scenes'][2]['scene_id'],'USE')]
    for sid,action in events:
        r=client.post('/api/event',headers=alice,json={'project_id':pid,'scene_id':sid,'prop':'KEY','action':action,'character':'MIRA'})
        assert r.status_code==200,r.text
    state=client.get('/api/state',params={'project_id':pid},headers=alice).json()
    assert len(state['continuity_warnings'])==1
    assert any(n['kind']=='prop' for n in state['graph']['nodes'])
    assert client.delete(f'/api/projects/{pid}',headers=alice).status_code==200
    assert client.get('/api/state',params={'project_id':pid},headers=alice).status_code==400


def test_pdf_import_upload(client,alice):
    buffer=BytesIO();
    pdf=Canvas(buffer)
    pdf.drawString(72,720,'INT. LIBRARY - DAY')
    pdf.drawString(72,700,'MIRA')
    pdf.drawString(72,680,'Where is it?')
    pdf.drawString(72,640,'EXT. PARK - NIGHT')
    pdf.drawString(72,620,'ARI')
    pdf.drawString(72,600,'I lost it.')
    pdf.save()
    pdf_bytes=buffer.getvalue()
    res=client.post('/api/import-file',headers=alice,files={'file':('sample.pdf',pdf_bytes,'application/pdf')},data={'title':'PDF Production'})
    assert res.status_code==200,res.text
    payload=res.json()['state']
    assert len(payload['scenes'])>=2
    assert payload['title']=='PDF Production'


def test_import_more_than_80_scenes(client,alice):
    script='\n\n'.join(
        f'INT. ROOM {index} - DAY\n\nMIRA\nScene {index} begins.'
        for index in range(1,82)
    )
    res=client.post('/api/import',headers=alice,json={'title':'Long Production','text':script})
    assert res.status_code==200,res.text
    state=res.json()['state']
    assert len(state['scenes'])==81
    assert state['settings']['slots_per_day']==16
    assert state['settings']['days']==11
    assert len(state['default_schedule']['assignments'])==81


def test_import_213_scenes_gets_full_27_day_default_schedule(client,alice):
    script='\n\n'.join(
        f'INT. ROOM {index} - DAY\n\nMIRA\nScene {index} begins.'
        for index in range(1,214)
    )
    result=client.post('/api/import',headers=alice,json={'title':'Long Feature','text':script})
    assert result.status_code==200,result.text
    state=result.json()['state']
    assert state['default_schedule_config']['estimated_days']==27
    assert state['default_schedule_config']['days']==27
    assert state['default_schedule_config']['max_days']==60
    assert state['settings']['days']==27
    assert len(state['default_schedule']['assignments'])==213
    character_id=state['characters'][0]['id']
    settings=state['settings']
    settings['actor_blocks'][str(character_id)]=[{'day':0,'start':0,'end':2}]
    changed=client.post('/api/settings',headers=alice,json={'project_id':state['id'],'settings':settings})
    assert changed.status_code==200,changed.text
    constrained_state=changed.json()['state']
    assert len(constrained_state['default_schedule']['assignments'])==213
    scenes={scene['scene_id']:scene for scene in constrained_state['scenes']}
    assert all(
        assignment['day']!=0 or assignment['start_slot']>=2
        for assignment in constrained_state['default_schedule']['assignments']
        if character_id in scenes[assignment['scene_id']]['character_ids']
    )


def test_structured_partial_day_constraints_are_persisted(client,alice):
    pid=first_project(client,alice)
    state=client.get('/api/state',params={'project_id':pid},headers=alice).json()
    actor_id=state['characters'][0]['id']
    location_id=state['locations'][0]['id']
    settings=state['settings']
    settings['actor_blocks'][str(actor_id)]=[{'day':0,'start':2,'end':4}]
    settings['location_blocks'][str(location_id)]=[{'day':1,'start':5,'end':7}]
    result=client.post('/api/settings',headers=alice,json={'project_id':pid,'settings':settings})
    assert result.status_code==200,result.text
    saved=result.json()['state']['settings']
    assert saved['actor_blocks'][str(actor_id)]==[{'day':0,'start':2,'end':4}]
    assert saved['location_blocks'][str(location_id)]==[{'day':1,'start':5,'end':7}]
    draft=result.json()['state']['default_schedule']
    assert len(draft['assignments'])==12
    scenes={scene['scene_id']:scene for scene in result.json()['state']['scenes']}
    for assignment in draft['assignments']:
        scene=scenes[assignment['scene_id']]
        if actor_id in scene['character_ids'] and assignment['day']==0:
            assert assignment['end_slot']<=2 or assignment['start_slot']>=4
        if scene['location_id']==location_id and assignment['day']==1:
            assert assignment['end_slot']<=5 or assignment['start_slot']>=7


def test_cors_exact_origin(client):
    res=client.options('/api/projects',headers={'Origin':'https://approved.github.io','Access-Control-Request-Method':'GET'})
    assert res.headers.get('access-control-allow-origin')!='*'


def test_frontend_uses_relative_assets():
    html=Path('docs/index.html').read_text()
    script=Path('docs/app.js').read_text(encoding='utf-8')
    assert 'href="./styles.css"' in html
    assert 'src="./app.js"' in html
    assert 'src="./config.js"' in html
    assert 'SCENEGRAPH_API_BASE' in Path('docs/config.js').read_text()
    assert 'FIREBASE_CONFIG' in Path('docs/config.js').read_text()
    assert 'Quick draft preview' not in script
    assert 'function openScheduleReview' in script
    assert 'id="scheduleEditForm"' in script
    assert "data-action=\"edit-assignment\"" in script
    assert 'initializeFirebaseSignIn' in script
