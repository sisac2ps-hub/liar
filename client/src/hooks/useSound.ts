import { useCallback } from 'react';

type SoundType = 'turn' | 'alert30' | 'alert5' | 'timeout' | 'vote' | 'reveal' | 'win' | 'loss';

export const useSound = () => {
  const playSynth = useCallback((type: SoundType) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      
      const playBeep = (freq: number, duration: number, waveType: OscillatorType = 'sine', volume = 0.08) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + duration);
      };

      switch (type) {
        case 'turn':
          // High upbeat double chime
          playBeep(523.25, 0.15); // C5
          setTimeout(() => playBeep(659.25, 0.2), 100); // E5
          break;
        case 'alert30':
          // Warning chime
          playBeep(440, 0.25); // A4
          setTimeout(() => playBeep(440, 0.25), 300);
          break;
        case 'alert5':
          // Critical ticking sound (High pitch, very short)
          playBeep(880, 0.08, 'triangle', 0.12); // A5
          break;
        case 'timeout':
          // Buzzer sound
          playBeep(180, 0.5, 'sawtooth', 0.1);
          break;
        case 'vote':
          // Pop sound
          playBeep(330, 0.12, 'sine', 0.05);
          break;
        case 'reveal':
          // Sweep up
          {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
          }
          break;
        case 'win':
          // Victory arpeggio (C Major)
          playBeep(523.25, 0.2); // C5
          setTimeout(() => playBeep(659.25, 0.2), 150); // E5
          setTimeout(() => playBeep(783.99, 0.2), 300); // G5
          setTimeout(() => playBeep(1046.50, 0.4), 450); // C6
          break;
        case 'loss':
          // Sad descending tones
          playBeep(392.00, 0.25, 'triangle'); // G4
          setTimeout(() => playBeep(349.23, 0.25, 'triangle'), 200); // F4
          setTimeout(() => playBeep(311.13, 0.25, 'triangle'), 400); // Eb4
          setTimeout(() => playBeep(246.94, 0.5, 'triangle'), 600); // B3
          break;
      }
    } catch (e) {
      console.error('Synthesizer audio failed:', e);
    }
  }, []);

  const playSound = useCallback((type: SoundType) => {
    // Attempt to load and play audio file first, fallback to synthesized audio
    const audio = new Audio(`/sounds/${type}.mp3`);
    audio.volume = 0.5;
    audio.play().catch((err) => {
      // If error (like file 404 or user interaction required), fallback to synth tones
      // Note: Synth tones also require user interaction but Web Audio Context restarts better.
      if (err.name === 'NotAllowedError') {
        console.warn('Audio play was blocked. Interaction required.');
      } else {
        // Fallback to Web Audio synthesized sound
        playSynth(type);
      }
    });
  }, [playSynth]);

  return { playSound };
};
