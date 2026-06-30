let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function playClickSound() {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.1);
}

function playSuccessSound() {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(440, ctx.currentTime);
    osc1.frequency.setValueAtTime(554.37, ctx.currentTime + 0.1);
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2);

    osc2.frequency.setValueAtTime(440, ctx.currentTime);
    osc2.frequency.setValueAtTime(554.37, ctx.currentTime + 0.1);
    osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(0.15, ctx.currentTime + 0.25);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.5);
    osc2.stop(ctx.currentTime + 0.5);
}

export { playClickSound, playSuccessSound };
