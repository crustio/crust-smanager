import { DataTypes, QueryInterface } from 'sequelize';
import { MigrationFn } from 'umzug';

export const up: MigrationFn<QueryInterface> = async ({
  context: sequelize,
}) => {
  await sequelize.createTable('orders', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    cid: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });
};

export const down: MigrationFn<QueryInterface> = async ({
  context: sequelize,
}) => {
  await sequelize.dropTable('orders');
};
