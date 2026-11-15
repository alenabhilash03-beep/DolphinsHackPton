"""Signed-in users for the hosted deployment (5C.2).

The browser signs in with Supabase Auth (Google). It sends the Supabase access token as a bearer token;
the API asks Supabase who the token belongs to and caches the answer briefly. This works with any Supabase
signing-key configuration and keeps no password or provider secret in this service.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from threading import Lock
from time import monotonic
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

LOCAL_USER_ID = 'local'
CACHE_SECONDS = 120.0


@dataclass(frozen=True)
class User:
    id: str
    name: str
    avatar_url: str | None = None

    @property
    def is_local(self) -> bool:
        return self.id == LOCAL_USER_ID


LOCAL_USER = User(id=LOCAL_USER_ID, name='Local researcher')


class AuthError(Exception):
    """The request has no usable signed-in identity."""


class AuthUnavailable(Exception):
    """The identity provider could not be reached; the request is not treated as signed out."""


def supabase_lookup(url: str, anon_key: str, timeout_s: float = 8.0) -> Callable[[str], dict]:
    def lookup(token: str) -> dict:
        request = Request(url.rstrip('/') + '/auth/v1/user', headers={'Authorization': f'Bearer {token}', 'apikey': anon_key})
        try:
            with urlopen(request, timeout=timeout_s) as response:
                return json.loads(response.read().decode())
        except HTTPError as exc:
            if exc.code in {401, 403}: raise AuthError('Sign-in expired or invalid') from exc
            raise AuthUnavailable('Identity provider error') from exc
        except (URLError, TimeoutError, ValueError) as exc:
            raise AuthUnavailable('Identity provider unreachable') from exc
    return lookup


class Authenticator:
    def __init__(self, mode: str, lookup: Callable[[str], dict] | None = None):
        self.mode = mode
        self.lookup = lookup
        self._cache: dict[str, tuple[float, User]] = {}
        self._lock = Lock()
        if mode == 'supabase' and lookup is None:
            raise ValueError('Supabase auth needs SUPABASE_URL and SUPABASE_ANON_KEY')

    @property
    def enabled(self) -> bool:
        return self.mode != 'off'

    def user(self, authorization: str | None) -> User | None:
        """The signed-in user, LOCAL_USER when auth is off, or None when no token was sent."""
        if not self.enabled: return LOCAL_USER
        if not authorization: return None
        match = re.fullmatch(r'Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})', authorization.strip())
        if not match: raise AuthError('Malformed authorization header')
        token = match[1]
        key = hashlib.sha256(token.encode()).hexdigest()
        now = monotonic()
        with self._lock:
            cached = self._cache.get(key)
            if cached and cached[0] > now: return cached[1]
        data = self.lookup(token)
        user_id = str(data.get('id') or '')
        if not re.fullmatch(r'[A-Za-z0-9-]{8,64}', user_id): raise AuthError('Identity provider returned no user')
        meta = data.get('user_metadata') or {}
        name = str(meta.get('full_name') or meta.get('name') or 'Researcher')[:120]
        avatar = meta.get('avatar_url') or meta.get('picture')
        user = User(id=user_id, name=name, avatar_url=str(avatar)[:500] if avatar else None)
        with self._lock:
            if len(self._cache) > 5000: self._cache.clear()
            self._cache[key] = (now + CACHE_SECONDS, user)
        return user
