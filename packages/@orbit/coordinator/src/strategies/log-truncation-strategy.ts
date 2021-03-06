import Coordinator, { ActivationOptions } from '../coordinator';
import { Strategy, StrategyOptions } from '../strategy';
import { Source, Transform } from '@orbit/data';
import { Dict } from '@orbit/utils';

export class LogTruncationStrategy extends Strategy {
  protected _reviewing: Promise<void>;
  protected _extraReviewNeeded: boolean;
  protected _transformListeners: Dict<(transform: Transform) => void>;

  constructor(options: StrategyOptions = {}) {
    options.name = options.name || 'log-truncation';
    super(options);
  }

  async activate(
    coordinator: Coordinator,
    options: ActivationOptions = {}
  ): Promise<void> {
    await super.activate(coordinator, options);
    this._transformListeners = {};
    for (let source of this._sources) {
      this._connectSource(source);
    }
  }

  async deactivate(): Promise<void> {
    await super.deactivate();
    for (let source of this._sources) {
      this._disconnectSource(source);
    }
    this._transformListeners = null;
  }

  _review(source: Source): Promise<void> {
    let sources = this._sources;
    let transformId = source.transformLog.head;

    if (transformId && sources.length > 1) {
      let match = true;

      for (let i = 0; i < sources.length; i++) {
        let s = sources[i];
        if (s !== source) {
          if (
            !s.requestQueue.empty ||
            !s.syncQueue.empty ||
            !s.transformLog.contains(transformId)
          ) {
            match = false;
            break;
          }
        }
      }
      if (match) {
        return this._truncateSources(transformId, 0);
      }
    }
  }

  _truncateSources(transformId: string, relativePosition: number) {
    return this._sources.reduce((chain, source) => {
      return chain.then(() =>
        source.transformLog.truncate(transformId, relativePosition)
      );
    }, Promise.resolve());
  }

  _connectSource(source: Source) {
    const listener = (this._transformListeners[source.name] = (): Promise<
      void
    > => {
      if (source.requestQueue.empty && source.syncQueue.empty) {
        return this._review(source);
      }
    });

    source.syncQueue.on('complete', listener);
    source.requestQueue.on('complete', listener);
  }

  _disconnectSource(source: Source) {
    const listener = this._transformListeners[source.name];
    source.syncQueue.off('complete', listener);
    source.requestQueue.off('complete', listener);
    delete this._transformListeners[source.name];
  }
}
