import _, { Function0 } from 'lodash';

export interface WeightItem<T> {
  weight: number;
  value: T;
}

export function makeRandomSelection<T>(items: WeightItem<T>[]): Function0<T> {
  const totalWeight = _.sumBy(items, (item) => item.weight);
  if (totalWeight < 0) {
    throw new Error('invalid weights');
  }

  return () => {
    let rnd = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      if (rnd < items[i].weight) {
        return items[i].value;
      }

      rnd -= items[i].weight;
    }

    return items[0].value; // should not get here
  };
}
