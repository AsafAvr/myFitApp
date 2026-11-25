export type Unsubscribe = () => void;
type Fn = (payload: never) => void;

export class EventBus<E extends object> {
  private handlers = new Map<PropertyKey, Fn[]>();

  on<K extends keyof E & string>(type: K, fn: (payload: E[K]) => void): Unsubscribe {
    let list = this.handlers.get(type);
    if (!list) this.handlers.set(type, (list = []));
    list.push(fn as Fn);
    return () => {
      const i = list!.indexOf(fn as Fn);
      if (i >= 0) list!.splice(i, 1);
    };
  }

  emit<K extends keyof E & string>(type: K, ...args: E[K] extends void | undefined ? [payload?: E[K]] : [payload: E[K]]): void {
    const list = this.handlers.get(type);
    if (!list || !list.length) return;
    const payload = args[0] as never;
    const run = list.length === 1 ? list : list.slice();
    for (let i = 0; i < run.length; i++) {
      try { run[i](payload); } catch (err) { console.error(`Listener for "${type}" failed:`, err); }
    }
  }
}
