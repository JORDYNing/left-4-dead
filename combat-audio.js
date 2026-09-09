// Original procedural audio. One shared mixer; no downloads or per-shot AudioContexts.
export function createCombatAudio({isEnabled = () => true, context = null} = {}) {
  let ctx = context, master, compressor, noise, lastError = null, lastLayers = [];
  const voices = new Set();
  const MAX_VOICES = 64;

  function init() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (!master) {
      master = ctx.createGain(); master.gain.value = .68;
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12; compressor.knee.value = 8;
      compressor.ratio.value = 6; compressor.attack.value = .002; compressor.release.value = .12;
      master.connect(compressor); compressor.connect(ctx.destination);
      noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 1.5), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && !ctx.startRendering && ctx.resume) ctx.resume().catch(e => { lastError = e.message; });
    return ctx.currentTime;
  }

  function voice(source, chain, at, duration) {
    const release = () => { source.disconnect(); chain.forEach(n => n.disconnect()); voices.delete(entry); };
    const entry = {stop() { try { source.stop(); } catch {} release(); }};
    if (voices.size >= MAX_VOICES) voices.values().next().value.stop();
    voices.add(entry); source.onended = release;
    source.start(at, ...(source.buffer ? [Math.random() * .5] : []));
    source.stop(at + duration + .01);
  }

  function envelope(gain, at, duration, level, attack = .001) {
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, level), at + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  }

  function hiss(at, duration, level, frequency, endFrequency, type = 'bandpass', pan = 0, q = .7) {
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
    const gain = ctx.createGain(), stereo = ctx.createStereoPanner();
    source.buffer = noise; source.playbackRate.value = .94 + Math.random() * .12;
    filter.type = type; filter.Q.value = q;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    stereo.pan.value = pan; envelope(gain, at, duration, level);
    source.connect(filter); filter.connect(gain); gain.connect(stereo); stereo.connect(master);
    voice(source, [filter, gain, stereo], at, duration);
  }

  function tone(at, duration, level, from, to, type = 'sine', pan = 0) {
    const source = ctx.createOscillator(), gain = ctx.createGain(), stereo = ctx.createStereoPanner();
    source.type = type; source.frequency.setValueAtTime(from, at);
    source.frequency.exponentialRampToValueAtTime(to, at + duration);
    envelope(gain, at, duration, level); stereo.pan.value = pan;
    source.connect(gain); gain.connect(stereo); stereo.connect(master);
    voice(source, [gain, stereo], at, duration);
  }

  function rifle(at, {first = true, ads = false, ally = false, layers} = {}) {
    const scale = ally ? .28 : first ? 1 : .91, variation = .96 + Math.random() * .08;
    const pan = ally ? -.35 : 0;
    lastLayers = [];
    const layer = (name, schedule) => {
      if (layers && !layers.includes(name)) return;
      lastLayers.push(name); schedule();
    };
    layer('blast', () => {
      // Fast ignition crack followed by a lower, longer powder body.
      hiss(at, .075, .48 * scale, 5200 * variation, 750, 'lowpass', pan);
      tone(at, .115, .28 * scale, 155 * variation, 46, 'triangle', pan);
    });
    layer('mechanic', () => {
      hiss(at, .018, .11 * scale, 4200, 2300, 'bandpass', .12, 2);
      hiss(at + .039, .052, .13 * scale, 1800, 850, 'bandpass', .25, 2.4);
      tone(at + .064, .025, .026 * scale, 2400, 1700, 'triangle', .2);
    });
    layer('kick', () => {
      tone(at + .007, .072, (ads ? .24 : .19) * scale, 82 * variation, 32);
      hiss(at + .007, .042, .12 * scale, 220, 90, 'lowpass');
    });
    layer('tail', () => {
      hiss(at + .035, .29, .071 * scale, 2600, 650, 'bandpass', -.23);
      hiss(at + .11, .25, .047 * scale, 1600, 300, 'lowpass', .32);
    });
  }

  function play(kind, options = {}) {
    if (!isEnabled()) return;
    try {
      const t = init(); master.gain.setValueAtTime(.68, t);
      if (kind === 'shot' || kind === 'allyshot') rifle(options.at ?? t, {...options, ally: kind === 'allyshot'});
      else if (kind === 'step') hiss(t, .105, .075, 290, 95, 'lowpass');
      else if (kind === 'casing') {
        tone(t, .055, .018, 3100, 2400, 'triangle', .5);
        hiss(t, .024, .019, 4100, 1600, 'highpass', .5);
      } else if (kind === 'reload' || kind === 'reloadEnd' || kind === 'dry') {
        hiss(t, .055, .16, 1700, 700, 'bandpass', .15, 2);
        if (kind !== 'dry') hiss(t + .09, .065, .11, 3500, 1600, 'highpass', .25);
        tone(t, .024, .04, kind === 'dry' ? 680 : 1250, 450, 'triangle');
      } else if (kind === 'hit' || kind === 'headshot' || kind === 'kill') {
        const kill = kind === 'kill', head = kind === 'headshot' || options.headshot;
        hiss(t, .033, .06, 2100, 700, 'bandpass');
        tone(t, kill ? .12 : .055, kill ? .09 : .055, head ? 1550 : 980, kill ? 420 : 690, 'triangle');
        if (kill) tone(t + .032, .15, .06, 220, 95);
      } else {
        const frequency = {pickup: 680, hurt: 70, wave: 180}[kind] || 300;
        tone(t, .2, .08, frequency, frequency * .45, kind === 'hurt' ? 'sawtooth' : 'triangle');
      }
    } catch (e) { lastError = e.message; }
  }

  function stop() { for (const v of [...voices]) v.stop(); }
  function mute() { stop(); if (master) master.gain.setValueAtTime(0, ctx.currentTime); }
  return {
    play, stop, mute,
    get status() { return {context: ctx?.state || 'uninitialized', voices: voices.size, maxVoices: MAX_VOICES, lastLayers, lastError}; },
  };
}
