interface IPromiseQueueOpts {
  concurrency: number;
}

type PromiseThunk = () => Promise<any>;

export default class PromiseQueue {
  private _queue: (() => any)[];
  private _pause: boolean;
  private _ongoingCount: number;
  private readonly _concurrency: number;

  constructor(opts: IPromiseQueueOpts) {
    this._queue = [];
    this._pause = false;
    opts = Object.assign({
      concurrency: 1,
    }, opts);

    if (opts.concurrency < 1) {
      throw new TypeError("Expected `concurrency` to be an integer which is bigger than 0");
    }

    this._ongoingCount = 0;
    this._concurrency = opts.concurrency;
  }

  public pause() {
    this._pause = true;
  }

  public resume() {
    this._pause = false;
    this._next();
  }

  /**
   * Clear current queue
   */
  public clear() {
    this._queue = []
    this._ongoingCount = 0
  }

  public add(fn: PromiseThunk | PromiseThunk[]): PromiseQueue | TypeError {
    if (Array.isArray(fn)) {
      if (fn.length > 1) {
        const res = this.add(fn.shift()!);
        if (!(res instanceof TypeError)) {
          return this.add(fn);
        }
      }
      return this.add(fn[0]);
    } else {
      // tslint:disable-next-line
      new Promise((resolve, reject) => {
        const run = () => {
          this._ongoingCount++;
          (fn as () => Promise<any>)().then(
            (val: any) => {
              resolve(val);
              this._ongoingCount--;
              this._next();
            },
            (err: Error) => {
              reject(err);
              this._ongoingCount--;
              this._next();
            },
          );
        };

        if (this._ongoingCount < this._concurrency && !this._pause) {
          run();
        } else {
          this._queue.push(run);
        }
      });
      return this;
    }
  }

  // Promises which are not ready yet to run in the queue.
  get waitingCount() {
    return this._queue.length;
  }

  // Promises which are running but not done.
  get ongoingCount() {
    return this._ongoingCount;
  }

  private _resolveEmpty: () => void = () => undefined;

  private _next() {
    if (this._ongoingCount >= this._concurrency || this._pause) {
      return;
    }

    if (this._queue.length > 0) {
      const firstQueueTask = this._queue.shift();
      if (firstQueueTask) {
        firstQueueTask();
      }
    } else {
      this._resolveEmpty();
    }
  }
}
