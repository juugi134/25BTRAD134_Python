import pytest
from pathlib import Path
from core.parser import parse_screenplay
from core.normalizer import normalize_script
BASE=Path(__file__).parents[1]
def test_twelve_scenes_and_verified_dialogue():
    d=normalize_script(parse_screenplay((BASE/'data/sample_script.fountain').read_text()))
    assert len(d['scenes'])==12
    assert {x['name'] for x in d['characters']}=={'MIRA','ARJUN','DEV','TARA'}
    assert d['scenes'][0]['speakers']==['MIRA','ARJUN']
    assert d['scenes'][0]['location']=='EDITING LAB'
    assert d['scenes'][0]['time_of_day']=='DAY'
def test_empty_and_missing_heading():
    with pytest.raises(ValueError,match='empty'):parse_screenplay('  ')
    with pytest.raises(ValueError,match='No Fountain'):parse_screenplay('There were no formatted scenes.')
def test_forced_scene_heading():
    parsed=normalize_script(parse_screenplay('.DREAM SEQUENCE\n\nNORA\nI remember.\n'))
    assert parsed['scenes'][0]['heading']=='DREAM SEQUENCE'

def test_scene_time_estimates_follow_screenplay_cues():
    script="""INT. HALLWAY - DAY
NORA walks across the room.

INT. ROOM - DAY
MIRA
Hello.
ARJUN
Hi.

INT. ROOM - EVENING
MIRA
I confront you.

INT. ROOM - NIGHT
MIRA
She cries and sobs.

EXT. STREET - NIGHT
A chase begins and the car crashes.

INT. OFFICE - DAY
The light comes through the window.
"""
    scenes=parse_screenplay(script)['scenes']
    assert [scene['duration_slots'] for scene in scenes]==[1,3,6,8,12,2]

def test_title_not_confused_for_actor():
    parsed=normalize_script(parse_screenplay('Title: ANOTHER FILM\n\nINT. OFFICE - DAY\n\nTARA\nI can hear you.'))
    assert parsed['scenes'][0]['speakers']==['TARA']
def test_parser_accepts_script_larger_than_one_mb():
    text='INT. STUDIO - DAY\n\n' + ('A' * (1024*1024+1))
    parsed=parse_screenplay(text)
    assert len(parsed['source_text']) > 1024*1024

def test_two_manual_reference_sets_match():
    from core.parser_eval import evaluate
    outcome=evaluate()
    assert len(outcome)==2
    assert sum(x['expected_scene_count'] for x in outcome)==15
    assert all(x['fully_matched'] for x in outcome)
