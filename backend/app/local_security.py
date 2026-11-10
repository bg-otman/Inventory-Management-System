"""The launcher authenticates locally, without accounts or a user password."""

import hmac
import os
from fastapi import HTTPException


def verify_request(request):
    token = os.environ.get("INVENTORY_LOCAL_TOKEN", "")
    supplied = request.headers.get("X-Inventory-Local", "")
    origin = request.headers.get("origin")
    client = request.client
    dev_origin = os.environ.get("INVENTORY_DEV_ORIGIN", "http://127.0.0.1:3000")
    localhost_origin = dev_origin.replace("://127.0.0.1:", "://localhost:", 1)
    if (
        os.environ.get("INVENTORY_DEV_MODE") == "1"
        and client is not None
        and client.host in {"127.0.0.1", "::1"}
        and origin in {None, dev_origin, localhost_origin}
    ):
        return
    if len(token) < 32 or not hmac.compare_digest(token, supplied):
        raise HTTPException(403, "Open Inventory using the desktop application.")
    if origin and origin != str(request.base_url).rstrip("/"):
        raise HTTPException(403, "Request origin is not permitted.")
