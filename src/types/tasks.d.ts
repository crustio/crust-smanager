import { AppContext } from './context';

export interface SimpleTask {
  name: string;
  start: (context: AppContext) => void;
  stop: () => Promise<boolean>;
}

export interface Task extends SimpleTask {
  onTick: (block: number) => Promise<unknown>;
}
