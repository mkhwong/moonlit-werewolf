"""Cut a recorded batch from the 粵語旁白錄音包 into one clip per line (public/voice/<key>.mp3).

  npx tsx scripts/voice-batches.ts > voice-batches.json
  python3 scripts/split-voice.py voice-batches.json <batch id, e.g. 04> recording.mp3 public/voice

The batch has N lines separated by pauses; the N-1 longest silences are the cuts (pauses inside a
line, at commas, are shorter). Each clip is trimmed, loudness-normalised and saved as mono mp3.
Needs ffmpeg. Prints each clip's length so odd cuts are easy to spot.
"""
import json, os, re, subprocess, sys, tempfile

def silences(path, noise='-38dB', dur=0.18):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', f'silencedetect=noise={noise}:d={dur}', '-f', 'null', '-'],
                       capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', r.stderr)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r.stderr)]
    total = float(re.search(r'Duration: (\d+):(\d+):([\d.]+)', r.stderr).groups()[2]) + \
        60 * float(re.search(r'Duration: (\d+):(\d+):', r.stderr).group(2)) + 3600 * float(re.search(r'Duration: (\d+):', r.stderr).group(1))
    return list(zip(starts, ends)), total

def main():
    batches, bid, src, out = sys.argv[1:5]
    batch = next(b for b in json.load(open(batches, encoding='utf8')) if b['id'] == bid)
    lines = batch['lines']; n = len(lines)
    sil, total = silences(src)
    inner = [(s, e) for s, e in sil if s > 0.05 and e < total - 0.05]   # ignore leading/trailing silence
    if len(inner) < n - 1:
        sys.exit(f'only {len(inner)} pauses found for {n} lines — the lines may run together; record with longer pauses')
    cuts = sorted(sorted(inner, key=lambda x: x[1] - x[0], reverse=True)[:n - 1])
    bounds, prev = [], 0.0
    for s, e in cuts:
        bounds.append((prev, (s + e) / 2)); prev = (s + e) / 2
    bounds.append((prev, total))
    os.makedirs(out, exist_ok=True)
    af = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
          'silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=7')
    for (a, b), ln in zip(bounds, lines):
        dst = os.path.join(out, f"{ln['key']}.mp3")
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', src,
                        '-af', af, '-ar', '24000', '-ac', '1', '-b:a', '48k', dst], check=True)
        d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst],
                                 capture_output=True, text=True).stdout or 0)
        flag = '  ← check' if d < 0.25 * len(ln['text'].replace('，', '').replace('。', '')) * 0.6 or d > 0.45 * len(ln['text']) + 1.2 else ''
        print(f"{ln['key']:<22} {d:5.2f}s  {ln['text']}{flag}")
    print(f'{n} clips from batch {bid}')
    # The game reads this list to know which lines have a recording.
    import json
    keys = sorted(f[:-4] for f in os.listdir(out) if f.endswith('.mp3'))
    with open(os.path.join(out, 'clips.json'), 'w') as fh: json.dump(keys, fh, ensure_ascii=False)

main()
