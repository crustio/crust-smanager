import express from 'express';
import { Logger } from 'winston';
import { AppContext } from '../types/context';
import * as bodyParser from 'body-parser';
import { FileInfo } from '../chain';
import { createFileOrderOperator } from '../db/file-record';

export async function startHttp(
    context: AppContext,
    loggerParent: Logger,
) {
    const logger = loggerParent.child({ moduleId: "http" });
    const app = express();
    const PORT = 42087;
    const fileOrderOp = createFileOrderOperator(context.database);

    app.use(bodyParser.json({ limit: '50mb' }));
    app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
    app.use(bodyParser.json());

    logger.info("Configure smanager interface");

    app.post('/api/v0/insert', async (req, res) => {
        const cid = req.body['cid'];
        if (!cid) {
            return res.status(400).send('Please provide cid in the request');
        }
        logger.info("Try to insert pinning job: %s", cid);

        const fi = await context.api.maybeGetFileUsedInfo(cid);
        if (!fi) {
            return res.status(400).send('Please provide ordered cid');
        }

        const sfi: FileInfo[] = [{
            cid: cid,
            size: Number(fi.file_size),
            tips: 0,
            expiredAt: fi.expired_at ? Number(fi.expired_at) : null,
            replicas: fi.replicas ? Number(fi.replicas) : null,
            owner: null
        }];

        await fileOrderOp.addFiles(sfi, 'active', true);

        return res.status(200).send(`Insert job: ${cid} success`);
    });

    app.listen(PORT, () => {
        logger.info(`Smanager interface run on http://localhost:${PORT}`);
    });
}
