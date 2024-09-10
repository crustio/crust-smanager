import { DataTypes, QueryInterface } from 'sequelize';
import { MigrationFn } from 'umzug';
import { withTransaction } from '../db-utils';

export const up: MigrationFn<QueryInterface> = async ({
  context: sequelize,
}) => {
  await withTransaction(sequelize, async (transaction) => {
    await sequelize.addColumn(
      'file_record',
      'retry_count',
      {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      {
        transaction,
      },
    );

    await sequelize.addColumn(
      'pin_record',
      'file_record_id',
      {
        type: DataTypes.INTEGER,
        allowNull: true,
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
  await sequelize.removeColumn('pin_record', 'file_record_id');
  await sequelize.removeColumn('file_record', 'retry_count');
};
