/**
 * FormForge Accurate Drift-Proof Assessment Timer
 */

class AssessmentTimer {
  constructor({ durationMinutes = 30, onTick = null, onExpire = null, onStateChange = null }) {
    this.totalDurationSeconds = durationMinutes * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.endTime = null;
    this.intervalId = null;
    this.isRunning = false;
    this.currentState = 'normal'; // normal | warning | critical | expired

    this.onTick = onTick;
    this.onExpire = onExpire;
    this.onStateChange = onStateChange;
  }

  start(existingStartTime = null) {
    if (this.totalDurationSeconds <= 0) return;

    const now = Date.now();
    if (existingStartTime) {
      this.endTime = existingStartTime + (this.totalDurationSeconds * 1000);
    } else {
      this.endTime = now + (this.totalDurationSeconds * 1000);
    }

    this.isRunning = true;
    this.update();

    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.update(), 500);
  }

  update() {
    if (!this.isRunning) return;

    const now = Date.now();
    const diff = Math.max(0, Math.round((this.endTime - now) / 1000));
    this.remainingSeconds = diff;

    // Check timer stages
    const percentRemaining = (this.remainingSeconds / this.totalDurationSeconds) * 100;
    let newState = 'normal';

    if (this.remainingSeconds <= 0) {
      newState = 'expired';
    } else if (percentRemaining <= 5) {
      newState = 'critical';
    } else if (percentRemaining <= 20) {
      newState = 'warning';
    }

    if (newState !== this.currentState) {
      this.currentState = newState;
      if (this.onStateChange) this.onStateChange(newState, percentRemaining);
    }

    if (this.onTick) {
      this.onTick({
        remainingSeconds: this.remainingSeconds,
        formatted: Utils.formatTime(this.remainingSeconds),
        percent: percentRemaining,
        state: this.currentState
      });
    }

    if (this.remainingSeconds <= 0) {
      this.stop();
      if (this.onExpire) this.onExpire();
    }
  }

  pause() {
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getStartTime() {
    return this.endTime ? this.endTime - (this.totalDurationSeconds * 1000) : Date.now();
  }
}

window.AssessmentTimer = AssessmentTimer;
