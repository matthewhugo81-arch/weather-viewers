"""Build small, georeferenced ECMWF IFS contour frames for the satellite viewer.

Only two indexed GRIB messages per valid time are downloaded. The immutable
frame cache avoids repeat downloads during the site's frequent publishing runs.
"""
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path

import contourpy
import eccodes as ec
import numpy as np
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

UTC = dt.timezone.utc
BBOX = [-100, 10, 60, 85]  # west, south, east, north
SOURCE = 'https://data.ecmwf.int/forecasts'
MIRROR = 'https://ecmwf-forecasts.s3.eu-central-1.amazonaws.com'


def iso(t):
    return t.isoformat(timespec='seconds').replace('+00:00', 'Z')


def request_session():
    s = requests.Session()
    s.mount('https://', HTTPAdapter(max_retries=Retry(total=2, backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504])))
    s.headers['User-Agent'] = 'weather-viewers-satellite-overlays/1.0'
    return s


def base_url(run, step, host=SOURCE):
    return (f'{host}/{run:%Y%m%d}/{run:%H}z/ifs/0p25/oper/'
            f'{run:%Y%m%d%H}0000-{step}h-oper-fc')


def simplify(points, tolerance=0.06):
    """Douglas-Peucker in degrees; keep endpoints and contour closure."""
    if len(points) <= 2:
        return points
    a, b = points[0], points[-1]
    v = b - a
    length2 = np.dot(v, v)
    if length2 == 0:
        distances = np.linalg.norm(points - a, axis=1)
    else:
        f = np.clip((points - a) @ v / length2, 0, 1)
        distances = np.linalg.norm(points - (a + f[:, None] * v), axis=1)
    i = int(np.argmax(distances))
    if distances[i] <= tolerance:
        return points[[0, -1]]
    return np.vstack([simplify(points[:i + 1], tolerance)[:-1],
                      simplify(points[i:], tolerance)])


def decode_field(data, expected, run, step):
    gid = ec.codes_new_from_message(data)
    try:
        name = ec.codes_get(gid, 'shortName')
        level = ec.codes_get(gid, 'level')
        if name != expected or (expected == 'gh' and level != 500):
            raise ValueError(f'Unexpected GRIB field: {name}, level {level}')
        valid = run + dt.timedelta(hours=step)
        if (ec.codes_get(gid, 'validityDate') != int(valid.strftime('%Y%m%d')) or
                ec.codes_get(gid, 'validityTime') != int(valid.strftime('%H%M'))):
            raise ValueError('GRIB valid time does not match the requested frame')
        ni, nj = ec.codes_get(gid, 'Ni'), ec.codes_get(gid, 'Nj')
        lat = ec.codes_get_array(gid, 'latitudes').reshape(nj, ni)
        lon = ec.codes_get_array(gid, 'longitudes').reshape(nj, ni)
        values = ec.codes_get_values(gid).reshape(nj, ni)
        # Validate the rectilinear grid rather than assuming the scanning order.
        if not np.allclose(lat, lat[:, :1]) or not np.allclose(lon, lon[:1, :]):
            raise ValueError('Expected a regular latitude/longitude grid')
        x = (lon[0] + 180) % 360 - 180
        y = lat[:, 0]
        ix, iy = np.argsort(x), np.argsort(y)
        x, y, values = x[ix], y[iy], values[iy][:, ix]
        cx = np.where((x >= BBOX[0]) & (x <= BBOX[2]))[0]
        cy = np.where((y >= BBOX[1]) & (y <= BBOX[3]))[0]
        values = values[cy][:, cx] / (100 if expected == 'msl' else 10)
        if not np.isfinite(values).all():
            raise ValueError('Non-finite model values')
        lo, hi = (800, 1150) if expected == 'msl' else (350, 700)
        if values.min() < lo or values.max() > hi:
            raise ValueError('Model units or values are outside expected bounds')
        return x[cx], y[cy], values
    finally:
        ec.codes_release(gid)


def contours(x, y, values, interval):
    gen = contourpy.contour_generator(x=x, y=y, z=values)
    out = []
    for level in range(math.ceil(values.min() / interval) * interval,
                       math.floor(values.max() / interval) * interval + 1, interval):
        for points in gen.lines(level):
            if len(points) < 3:
                continue
            pts = simplify(points)
            if len(pts) >= 2:
                out.append({'value': level, 'points': np.round(pts, 2).tolist()})
    return out


def get_frame(session, run, step, cache):
    key = f'{run:%Y%m%d%H}-{step}.json'
    cached = cache / key
    if cached.exists():
        return json.loads(cached.read_text())
    last_error = None
    for host in [SOURCE, MIRROR]:
        try:
            base = base_url(run, step, host)
            response = session.get(base + '.index', timeout=30)
            response.raise_for_status()
            entries = [json.loads(line) for line in response.text.splitlines() if line]
            frame = {'run': iso(run), 'valid': iso(run + dt.timedelta(hours=step)),
                     'step': step, 'layers': {}}
            for param, interval in [('msl', 4), ('gh', 6)]:
                field = next(e for e in entries if e['param'] == param and
                             (param == 'msl' or str(e.get('levelist')) == '500'))
                offset, size = int(field['_offset']), int(field['_length'])
                # A server ignoring Range must not cause a whole forecast download.
                with session.get(base + '.grib2', headers={
                    'Range': f'bytes={offset}-{offset+size-1}'}, stream=True, timeout=45) as r:
                    if r.status_code != 206:
                        raise ValueError(f'GRIB server did not honour Range: {r.status_code}')
                    data = r.content
                if len(data) != size or not data.startswith(b'GRIB'):
                    raise ValueError('Invalid or incomplete GRIB message')
                grid = decode_field(data, param, run, step)
                frame['layers'][param] = contours(*grid, interval)
            cached.write_text(json.dumps(frame, separators=(',', ':')))
            return frame
        except (requests.RequestException, ValueError, StopIteration) as error:
            last_error = error
    raise RuntimeError(f'Could not load {key}: {last_error}')


def generate(out, now=None):
    now = now or dt.datetime.now(UTC)
    out.mkdir(parents=True, exist_ok=True)
    cache = out / '.cache'
    cache.mkdir(exist_ok=True)
    session = request_session()
    end = now.replace(hour=now.hour // 3 * 3, minute=0, second=0, microsecond=0)
    frames = []
    # Past 30 hours plus six ahead cover 24h satellite loops across run changes.
    for offset in range(-30, 7, 3):
        valid = end + dt.timedelta(hours=offset)
        # 00/12 UTC IFS cycles; try the newer cycle then the preceding one.
        anchor = min(valid, now).replace(minute=0, second=0, microsecond=0)
        anchor = anchor.replace(hour=anchor.hour // 12 * 12)
        for back in [0, 12, 24]:
            run = anchor - dt.timedelta(hours=back)
            step = int((valid - run).total_seconds() / 3600)
            try:
                frame = get_frame(session, run, step, cache)
                frames.append(frame)
                print(f'{frame["valid"]}: run {frame["run"]} +{step}h', flush=True)
                break
            except RuntimeError as error:
                print(str(error), flush=True)
    # Never overwrite a usable bundle with a total or current-time failure.
    if not frames or min(abs((dt.datetime.fromisoformat(f['valid'].replace('Z', '+00:00')) - now).total_seconds()) for f in frames) > 5400:
        raise RuntimeError('No ECMWF frame within 90 minutes of now; preserving old bundle')
    bundle = {'schema': 1, 'model': 'ECMWF IFS', 'generated': iso(now),
              'source': 'https://www.ecmwf.int/en/forecasts/datasets/open-data',
              'licence': 'CC BY 4.0', 'bbox': BBOX, 'maxOffsetMinutes': 90,
              'intervals': {'msl': 4, 'gh': 6}, 'units': {'msl': 'hPa', 'gh': 'dam'},
              'frames': frames}
    temp = out / 'latest.json.tmp'
    temp.write_text(json.dumps(bundle, separators=(',', ':')), encoding='utf-8')
    os.replace(temp, out / 'latest.json')
    cutoff = now - dt.timedelta(days=4)
    for p in cache.glob('*.json'):
        if dt.datetime.fromtimestamp(p.stat().st_mtime, UTC) < cutoff:
            p.unlink()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path(__file__).parent)
    generate(parser.parse_args().output)
