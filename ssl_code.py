from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import datetime

# 1. Generate private key
key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
    backend=default_backend()
)

# 2. Build certificate subject and issuer (self-signed, so same for both)
subject = issuer = x509.Name([
    x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
    x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Telangana"),
    x509.NameAttribute(NameOID.LOCALITY_NAME, "Hyderabad"),
    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "QMS Tracker"),
    x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
])

# 3. Create certificate
cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(issuer)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.utcnow())
    .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))  # 1 year
    .add_extension(
        x509.SubjectAlternativeName([x509.DNSName("localhost")]),
        critical=False,
    )
    .sign(key, hashes.SHA256(), default_backend())
)

# 4. Write private key to file
with open("key.pem", "wb") as f:
    f.write(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )

# 5. Write certificate to file
with open("cert.pem", "wb") as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))

print("✅ key.pem and cert.pem generated successfully!")
