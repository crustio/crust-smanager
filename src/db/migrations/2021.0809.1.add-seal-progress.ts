import { DataTypes, QueryInterface } from 'sequelize';
import { MigrationFn } from 'umzug';
import { withTransaction } from '../db-utils';

export const up: MigrationFn<QueryInterface> = async ({
  context: sequelize,
}) => {
  await withTransaction(sequelize, async (transaction) => {
    await sequelize.addColumn(
      'pin_record',
      'sealed_size',
      {
        type: DataTypes.NUMBER,
        defaultValue: 0,
      },
      {
        transaction,
      },
    );

    await sequelize.addColumn(
      'pin_record',
      'last_check_time',
      {
        type: DataTypes.NUMBER,
        defaultValue: 0,
      },
      {
        transaction,
      },
    );
  });
};

export const down: MigrationFn<QueryInterface> = async ({
  context: sequelize,
}) => {
  await sequelize.removeColumn('pin_record', 'last_check_time');
  await sequelize.removeColumn('pin_record', 'sealed_size');
};
