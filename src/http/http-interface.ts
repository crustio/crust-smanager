import express from 'express';
import { Logger } from 'winston';
import { AppContext } from '../types/context';
import * as bodyParser from 'body-parser';

export async function startHttp(
    context: AppContext,
    loggerParent: Logger,
) {
    const logger = loggerParent.child({ moduleId: "http" });
    const app = express();
    const PORT = 42087;

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

        return res.status(200).send('Success');
    });

    app.listen(PORT, () => {
        logger.info(`Smanager interface run on http://localhost:${PORT}`);
    });
}
