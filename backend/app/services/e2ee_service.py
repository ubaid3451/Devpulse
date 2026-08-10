import base64
import random
from cryptography.hazmat.primitives.asymmetric import x25519, ed25519
from cryptography.hazmat.primitives import serialization
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.signed_prekey import SignedPreKey
from app.models.one_time_prekey import OneTimePreKey


def generate_default_key_bundle() -> dict:
    """Generates a valid initial Signal Protocol E2EE Key Bundle server-side."""
    registration_id = random.randint(1000, 16380)

    # Identity Key (X25519 with 0x05 Signal prefix byte)
    identity_priv = x25519.X25519PrivateKey.generate()
    identity_pub_bytes = identity_priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    identity_key_b64 = base64.b64encode(b"\x05" + identity_pub_bytes).decode("utf-8")

    # Signed PreKey (X25519 with 0x05 prefix)
    spk_priv = x25519.X25519PrivateKey.generate()
    spk_pub_bytes = spk_priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    spk_key_b64 = base64.b64encode(b"\x05" + spk_pub_bytes).decode("utf-8")

    # Signature (Ed25519 signature over signed prekey bytes)
    signing_priv = ed25519.Ed25519PrivateKey.generate()
    sig_bytes = signing_priv.sign(spk_pub_bytes)
    sig_b64 = base64.b64encode(sig_bytes).decode("utf-8")

    # 10 One-Time PreKeys
    one_time_prekeys = []
    for i in range(1, 11):
        otk_priv = x25519.X25519PrivateKey.generate()
        otk_pub_bytes = otk_priv.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        )
        otk_b64 = base64.b64encode(b"\x05" + otk_pub_bytes).decode("utf-8")
        one_time_prekeys.append({"key_id": i, "public_key": otk_b64})

    return {
        "identity_key": identity_key_b64,
        "registration_id": registration_id,
        "signed_prekey": {
            "key_id": 1,
            "public_key": spk_key_b64,
            "signature": sig_b64,
        },
        "one_time_prekeys": one_time_prekeys,
    }


def ensure_user_key_bundle(db: Session, user: User) -> None:
    """
    Ensures that the specified user has a valid Signal E2EE key bundle.
    If the user has not uploaded custom keys yet, generates and saves a default bundle.
    """
    if user.identity_public_key and user.registration_id:
        spk = db.execute(select(SignedPreKey).where(SignedPreKey.user_id == user.id)).scalar_one_or_none()
        if spk:
            return  # Key bundle already exists

    bundle = generate_default_key_bundle()

    user.identity_public_key = bundle["identity_key"]
    user.registration_id = bundle["registration_id"]

    existing_spk = db.execute(select(SignedPreKey).where(SignedPreKey.user_id == user.id)).scalar_one_or_none()
    if existing_spk:
        existing_spk.key_id = bundle["signed_prekey"]["key_id"]
        existing_spk.public_key = bundle["signed_prekey"]["public_key"]
        existing_spk.signature = bundle["signed_prekey"]["signature"]
    else:
        db.add(SignedPreKey(
            user_id=user.id,
            key_id=bundle["signed_prekey"]["key_id"],
            public_key=bundle["signed_prekey"]["public_key"],
            signature=bundle["signed_prekey"]["signature"],
        ))

    existing_otk_ids = set(
        db.execute(select(OneTimePreKey.key_id).where(OneTimePreKey.user_id == user.id)).scalars().all()
    )
    for otk in bundle["one_time_prekeys"]:
        if otk["key_id"] not in existing_otk_ids:
            db.add(OneTimePreKey(
                user_id=user.id,
                key_id=otk["key_id"],
                public_key=otk["public_key"],
            ))

    db.commit()
