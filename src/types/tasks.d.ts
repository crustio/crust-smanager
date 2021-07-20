import { AppContext } from './context';

export interface Task {
  name: string;
  start: (context: AppContext) => void;
  onTick: (block: number) => Promise<unknown>;
  stop: () => Promise<boolean>;
}
