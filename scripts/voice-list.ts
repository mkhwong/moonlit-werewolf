// Prints every narrator clip (key → text) as JSON for scripts/gen-voice.py.
import { allClips } from '../shared/voiceLines';
console.log(JSON.stringify(allClips()));
