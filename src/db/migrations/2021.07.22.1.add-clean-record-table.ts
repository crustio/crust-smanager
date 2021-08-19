import { DataTypes, QueryInterface } from 'sequelize';
import { MigrationFn } from 'umzug';
import { withTransaction } from '../db-utils';

export const up: MigrationFn<QueryInterface> = async ({
  context: sequelize,
}) => {
  await createCleanupRecordTable(sequelize);
};

export const down: MigrationFn<QueryInterface> = async ({
  context: sequelize,
}) => {
  await sequelize.dropTable('cleanup_record');
};

async function createCleanupRecordTable(sequelize: QueryInterface) {
  await withTransaction(sequelize, async (transaction) => {
    await sequelize.createTable(
      'cleanup_record',
      {
        id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
        },
        cid: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        status: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        last_updated: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        create_at: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
      },
      {
        transaction,
      },
    );
    await sequelize.addIndex('cleanup_record', ['cid'], {
      transaction,
    });
    await sequelize.addIndex('cleanup_record', ['status'], {
      transaction,
    });
    await sequelize.addIndex('cleanup_record', ['last_updated'], {
      transaction,
    });
    await sequelize.addIndex('cleanup_record', ['create_at'], {
      transaction,
    });
  });
}
