"""Fair first-fit baseline respecting all modeled hard constraints."""
import time
from .constraints import validate_config, candidates, allowed, verify_schedule, schedule_metrics


def _best_fit_day_pack(scenes, cfg):
    max_scenes = cfg.get('max_scenes_per_day')
    slots_per_day = cfg['slots_per_day']
    remaining = list(scenes)
    out = []
    for day in range(cfg['days']):
        if not remaining:
            break
        slot = 0
        daily_count = 0
        while slot < slots_per_day and remaining:
            if max_scenes is not None and daily_count >= max_scenes:
                break
            rem_cap = slots_per_day - slot
            avail = [s for s in remaining if s['duration_slots'] <= rem_cap and allowed(s, day, slot, cfg)]
            if not avail:
                slot += 1
                continue
            dur_counts = {}
            for s in avail:
                dur_counts[s['duration_slots']] = dur_counts.get(s['duration_slots'], 0) + 1

            def score(s):
                dur = s['duration_slots']
                after = rem_cap - dur
                exact = after == 0
                can_fill_exact = after in dur_counts and (after != dur or dur_counts[dur] >= 2)
                return (exact or can_fill_exact, dur, -s['script_order'])

            chosen = max(avail, key=score)
            remaining.remove(chosen)
            out.append({
                'scene_id': chosen['scene_id'],
                'day': day,
                'start_slot': slot,
                'end_slot': slot + chosen['duration_slots'],
                'location_id': chosen['location_id'],
            })
            slot += chosen['duration_slots']
            daily_count += 1
    if remaining:
        return None
    out.sort(key=lambda a: (a['day'], a['start_slot']))
    return out


def greedy_schedule(scenes, cfg, order=None):
    began = time.perf_counter()
    validate_config(scenes, cfg)
    occupied = set()
    out = []
    daily_counts = {}
    max_scenes = cfg.get('max_scenes_per_day')
    sequence = order if order is not None else sorted(scenes, key=lambda s: s['script_order'])
    failed = False
    for scene in sequence:
        feasible = None
        for day, start in candidates(scene, cfg):
            if max_scenes is not None and daily_counts.get(day, 0) >= max_scenes:
                continue
            if all((day, t) not in occupied for t in range(start, start + scene['duration_slots'])):
                feasible = (day, start)
                break
        if feasible is None:
            failed = True
            break
        day, start = feasible
        occupied.update((day, t) for t in range(start, start + scene['duration_slots']))
        daily_counts[day] = daily_counts.get(day, 0) + 1
        out.append({
            'scene_id': scene['scene_id'],
            'day': day,
            'start_slot': start,
            'end_slot': start + scene['duration_slots'],
            'location_id': scene['location_id'],
        })
    if failed:
        packed = _best_fit_day_pack(scenes, cfg)
        if packed is None:
            return {
                'status': 'FAILED_FIRST_FIT',
                'method': 'First-fit baseline',
                'assignments': [],
                'metrics': {},
                'elapsed_ms': round((time.perf_counter() - began) * 1000, 1),
                'violations': [],
                'message': 'Could not fit all scenes into the current calendar days. Increase the number of production days or hours per day in Calendar & Availability.',
            }
        out = packed
    out.sort(key=lambda a: (a['day'], a['start_slot']))
    return {
        'status': 'FEASIBLE',
        'method': 'First-fit baseline',
        'assignments': out,
        'metrics': schedule_metrics(out),
        'elapsed_ms': round((time.perf_counter() - began) * 1000, 1),
        'violations': verify_schedule(scenes, cfg, out),
        'message': 'First-fit heuristic; no optimality guarantee.',
    }
