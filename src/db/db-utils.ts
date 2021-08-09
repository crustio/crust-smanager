import { QueryInterface, Transaction } from 'sequelize';

export async function withTransaction<T>(
  sequelize: QueryInterface,
  func: (tras: Transaction) => T,
): Promise<T> {
  const transaction = await sequelize.sequelize.transaction();
  const v = await func(transaction);
  await transaction.commit();
  return v;
}
