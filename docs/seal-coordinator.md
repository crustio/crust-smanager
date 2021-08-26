# Seal Coordinator Api Spec

## Requst Headers
All Requests to seal coordinator will include below http headers.
   1. nodeId: the requested node unique identifier
   2. Authorization: auth header, currently smanager only supports bear token headers

## GET /ping
`/ping` is the health check url for seal coordinator api, it should return http status `200` if everything looks good.

The implementation should check the `Authorization` http header if it implements any authorization mechanism and returns http status `401`
for failed authorizations.

## POST /node/{nodeId}/seal/{cid}
The node requests to this api before it starts sealing this file. Successful call should return `{seal: true, reason: 'ok'}`. Failed call should indicates `seal` to false, and with a _reason_.
## Delete /node/{nodeId}/seal/{cid}
The node requests to this api before it deletes this file from local node. Successful call should return `{seal: true, reason: 'ok'}`. Failed call should indicates `seal` to false and with a _reason_.

## Seal Reason
Currently smanager supports below reasons, the implementation should choose the approciate reason.
    1. skipFile: This file should not handled by the calling node, the node should not seal this file.
    2. pullDisabled: Files pulling is disabled by coordinator, the node should not seal this file at now, but it should retry checking later.