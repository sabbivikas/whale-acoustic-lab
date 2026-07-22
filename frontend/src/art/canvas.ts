import type { ArtParameters } from "./parameters";
import { hashWords, sfc32 } from "./prng";

const SIZE = 1200;

export class OceanRenderer {
  private context: CanvasRenderingContext2D;
  private frame = 0;
  private started = 0;
  private elapsed = 0;
  private running = false;

  constructor(private canvas: HTMLCanvasElement, private art: ArtParameters) {
    canvas.width = SIZE; canvas.height = SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.draw(0);
  }

  replay(): void { this.elapsed = 0; this.started = performance.now(); this.running = true; this.loop(); }
  pause(): void { if (this.running) this.elapsed += performance.now() - this.started; this.running = false; cancelAnimationFrame(this.frame); }
  resume(): void { if (!this.running) { this.started = performance.now(); this.running = true; this.loop(); } }
  isRunning(): boolean { return this.running; }
  download(): void {
    const link = document.createElement("a");
    link.download = `whalesong-${this.art.seed.slice(0, 10)}.png`;
    link.href = this.canvas.toDataURL("image/png"); link.click();
  }

  private loop = (): void => {
    if (!this.running) return;
    this.draw((this.elapsed + performance.now() - this.started) / 1000);
    this.frame = requestAnimationFrame(this.loop);
  };

  private draw(time: number): void {
    const ctx = this.context;
    const gradient = ctx.createRadialGradient(610, 430, 80, 600, 600, 820);
    gradient.addColorStop(0, `hsl(${this.art.backgroundHue + 15} 58% 20%)`);
    gradient.addColorStop(0.55, `hsl(${this.art.backgroundHue} 65% 10%)`);
    gradient.addColorStop(1, `hsl(${this.art.backgroundHue - 12} 70% 4%)`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.save(); ctx.globalCompositeOperation = "screen";
    this.art.forms.forEach((form, index) => {
      const pulse = 1 + Math.sin(time * form.speed * 2 + form.phase) * 0.09;
      const x = form.x * SIZE + Math.cos(time * form.speed + form.phase) * form.orbit;
      const y = form.y * SIZE + Math.sin(time * form.speed * 0.8 + form.phase) * form.orbit;
      const hue = (index % 4 === 0 ? this.art.accentHue : this.art.primaryHue) + form.hueShift;
      ctx.beginPath();
      for (let point = 0; point <= form.sides; point++) {
        const angle = form.rotation + time * form.speed * 0.12 + point * Math.PI * 2 / form.sides;
        const radius = form.radius * pulse * (point % 2 ? 0.82 : 1);
        const px = x + Math.cos(angle) * radius; const py = y + Math.sin(angle) * radius;
        point ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = `hsla(${hue} ${this.art.saturation}% ${this.art.lightness}% / ${form.alpha})`;
      ctx.strokeStyle = `hsla(${hue + 20} 80% 76% / ${Math.min(0.6, form.alpha + 0.12)})`;
      ctx.lineWidth = this.art.lineWidth; ctx.fill(); ctx.stroke();
    });
    ctx.restore();

    const random = sfc32(...hashWords(this.art.seed));
    ctx.fillStyle = `rgba(205, 244, 242, ${this.art.grain})`;
    for (let index = 0; index < 900; index++) {
      const x = random() * SIZE; const y = random() * SIZE;
      ctx.fillRect(x, y, 0.5 + random() * 1.8, 0.5 + random() * 1.8);
    }
  }
}
