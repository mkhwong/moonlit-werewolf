"""Record the 粵語 narrator clips into public/voice/*.mp3 (offline, no service needed).

Uses the open-source sherpa-onnx VITS Cantonese model (vits-cantonese-hf-xiaomaiiwn):
  pip install sherpa-onnx soundfile opencc-python-reimplemented
  curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-cantonese-hf-xiaomaiiwn.tar.bz2 && tar xjf vits-cantonese-hf-xiaomaiiwn.tar.bz2
  npx tsx scripts/voice-list.ts > voice-list.json
  python3 scripts/gen-voice.py voice-list.json path/to/vits-cantonese-hf-xiaomaiiwn public/voice
Needs ffmpeg for trimming, loudness and mp3.
"""
import json, os, subprocess, sys, tempfile
import sherpa_onnx, soundfile as sf
from opencc import OpenCC

lst, M, out = sys.argv[1], sys.argv[2].rstrip('/'), sys.argv[3]
name = os.path.basename(M)
os.makedirs(out, exist_ok=True)
cc = OpenCC('t2s')  # the model's lexicon is in simplified characters
tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
        model=f'{M}/{name}.onnx', lexicon=f'{M}/lexicon.txt', tokens=f'{M}/tokens.txt'), num_threads=4),
    rule_fsts=f'{M}/rule.fst', max_num_sentences=1))
clips = json.load(open(lst, encoding='utf8'))
trim = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
        'silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=7')
for i, (key, text) in enumerate(clips.items()):
    a = tts.generate(cc.convert(text.replace(' ', '')), sid=0, speed=1.0)
    with tempfile.NamedTemporaryFile(suffix='.wav') as w:
        sf.write(w.name, a.samples, a.sample_rate)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', w.name, '-af', trim, '-ar', '22050', '-ac', '1',
                        '-b:a', '40k', os.path.join(out, f'{key}.mp3')], check=True)
    if i % 25 == 0: print(f'{i + 1}/{len(clips)} {key} {text}', flush=True)
print('done', len(clips))
