# HTTPS Certificate Lifecycle and Renewal

## Certificate hierarchy

Each installed server creates one customer-specific private certificate authority (CA) and one HTTPS server certificate.

```text
Eaststone Stock Control Private CA
  └── stock-control.test HTTPS server certificate
```

Files:

```text
infra\certs\stock-control-ca.crt   public CA — copied to clients
infra\certs\stock-control-ca.key   private CA key — server only
infra\certs\stock-control.crt      current server certificate
infra\certs\stock-control.key      current server private key — server only
```

## Validity periods

New installations use:

- private CA: approximately 30 years;
- server certificate: 825 days.

No secure certificate should be treated as literally permanent. Long-term operation is achieved by automatic server-certificate renewal and early warning before the private CA needs controlled replacement.

## Automatic server-certificate renewal

The scheduled task:

```text
Eaststone Stock Control - Certificate Renewal
```

runs daily at 02:15 and calls:

```text
windows\Certificate-Renewal.ps1
```

The script:

1. reads the configured hostname and server IP;
2. verifies Docker is running;
3. checks the current server certificate;
4. renews it when fewer than 90 days remain;
5. reuses the existing private CA;
6. generates a fresh server private key and certificate;
7. restarts the Nginx web service;
8. records the result in `logs\certificate-renewal.log`.

Because the private CA remains unchanged, client computers do not re-import the CA during normal server-certificate renewals.

## Private CA expiry

The CA cannot be renewed invisibly forever because client trust is anchored to that public CA certificate. The health and renewal monitors record remaining CA lifetime and begin warning when fewer than five years remain.

A planned CA rollover should then be managed under change control:

1. create the replacement CA;
2. distribute the new public CA to all clients while the old CA is still valid;
3. verify dual trust across the client estate;
4. issue the server certificate from the new CA;
5. update the controlled client deployment package;
6. retain evidence and approvals;
7. retire the old CA only after all clients have migrated.

This avoids an unexpected outage decades after installation.

## Never regenerate the CA casually

Routine execution of the HTTPS or renewal scripts reuses the existing CA. A new CA should only be created deliberately under controlled change.

Running the certificate generator with `--new-ca` archives the old CA files and creates a new one. After this action, client computers must trust the new public CA before the site is trusted again.

## Monitoring and evidence

Review:

```text
logs\certificate-renewal.log
logs\health-status.json
logs\health-monitor.log
```

The IQ report records current certificate and trust-store evidence at installation.

## Disaster recovery

The private CA key and server private key are not stored inside the PostgreSQL backup. A complete server recovery package therefore requires protected backup of:

```text
.env
infra\certs\stock-control-ca.key
infra\certs\stock-control-ca.crt
infra\certs\stock-control.key
infra\certs\stock-control.crt
deployment\server-config.ini
PostgreSQL database backup
approved release package
```

Private keys must be encrypted/protected and access-controlled. Losing the private CA key prevents future server certificates being issued from the CA already trusted by clients; a new CA deployment would then be required.

## Public certificate alternative

For customers with a registered domain and suitable DNS automation, a publicly trusted ACME certificate may be preferable. That removes private-CA installation from clients but introduces domain/DNS and external certificate-renewal dependencies. The deployment mode must be selected and validated for the customer environment.
