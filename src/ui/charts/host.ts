import { animate, lerpData } from '../util';

export type RenderFn<D> = (data: D, width: number, height: number) => string;

/**
 * Hosts a hand-written chart: measures its container, re-renders on resize, and tweens
 * between data states so bars/whiskers/bands glide instead of jumping.
 */
export class ChartHost<D> {
  private target?: D;
  private shown?: D;
  private gen = 0;
  private ro: ResizeObserver;

  constructor(
    readonly el: HTMLElement,
    private render: RenderFn<D>,
  ) {
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(el);
  }

  private draw(data = this.shown): void {
    if (data === undefined) return;
    const { width, height } = this.el.getBoundingClientRect();
    if (width < 10 || height < 10) return;
    this.el.innerHTML = this.render(data, width, height);
  }

  /** Show `data`, tweening from the current state over `ms` (0 = jump). */
  async set(data: D, ms = 0): Promise<void> {
    const gen = ++this.gen;
    const from = this.shown;
    this.target = data;
    if (!from || ms <= 0) {
      this.shown = data;
      this.draw();
      return;
    }
    await animate(
      ms,
      (t) => {
        this.shown = t >= 1 ? data : lerpData(from, data, t);
        this.draw();
      },
      () => gen !== this.gen,
    );
  }

  get current(): D | undefined {
    return this.target;
  }

  clear(): void {
    this.gen++;
    this.shown = undefined;
    this.target = undefined;
    this.el.innerHTML = '';
  }
}
