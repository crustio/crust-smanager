import { DataTypes, QueryInterface, Transaction } from 'sequelize';
import { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({
  context: sequelize,
}) => {
  await sequelize.createTable('config', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  });

  await createFileRecordTable(sequelize);
  await createPinRecordTable(sequelize);
  await createFileOwnersTable(sequelize);
};

export const down: MigrationFn<QueryInterface> = async ({
  context: sequelize,
}) => {
  await sequelize.dropTable('file_woner');
  await sequelize.dropTable('pin_record');
  await sequelize.dropTable('file_record');
  await sequelize.dropTable('config');
};

async function withTransaction<T>(
  sequelize: QueryInterface,
  func: (tras: Transaction) => T,
): Promise<T> {
  const transaction = await sequelize.sequelize.transaction();
  const v = await func(transaction);
  await transaction.commit();
  return v;
}

async function createFileRecordTable(sequelize: QueryInterface) {
  await withTransaction(sequelize, async (transaction) => {
    await sequelize.createTable(
      'file_record',
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
        expire_at: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        size: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        amount: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        replicas: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        indexer: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        status: {
          type: DataTypes.STRING,
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
    await sequelize.addIndex('file_record', ['cid'], {
      transaction,
    });
    await sequelize.addIndex('file_record', ['size'], {
      transaction,
    });
    await sequelize.addIndex('file_record', ['amount'], {
      transaction,
    });
    await sequelize.addIndex('file_record', ['indexer'], {
      transaction,
    });
    await sequelize.addIndex('file_record', ['status'], {
      transaction,
    });
    await sequelize.addIndex('file_record', ['last_updated'], {
      transaction,
    });
    await sequelize.addIndex('file_record', ['create_at'], {
      transaction,
    });
  });
}

async function createPinRecordTable(sequelize: QueryInterface) {
  await withTransaction(sequelize, async (transaction) => {
    await sequelize.createTable(
      'pin_record',
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
        pin_at: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        pin_by: {
          type: DataTypes.STRING,
          allowNull: false,
        },
      },
      {
        transaction,
      },
    );
    await sequelize.addIndex('pin_record', ['cid'], {
      transaction,
    });
    await sequelize.addIndex('pin_record', ['pin_at'], {
      transaction,
    });
    await sequelize.addIndex('pin_record', ['pin_by'], {
      transaction,
    });
  });
}

async function createFileOwnersTable(sequelize: QueryInterface) {
  await withTransaction(sequelize, async (transaction) => {
    await sequelize.createTable(
      'file_owner',
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
        owner: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        create_at: {
          type: DataTypes.STRING,
          allowNull: false,
        },
      },
      {
        transaction,
      },
    );
    await sequelize.addIndex('file_owner', ['cid'], {
      transaction,
    });
    await sequelize.addIndex('file_owner', ['owner'], {
      transaction,
    });
    await sequelize.addIndex('file_owner', ['create_at'], {
      transaction,
    });
  });
}
