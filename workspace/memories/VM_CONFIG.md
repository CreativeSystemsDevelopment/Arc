# Atlas Platform VM Configuration

Stored: 2026-03-29

## VM Details
- **Name**: atlas-platform
- **Machine Type**: e2-highmem-4 (4 vCPUs, high memory)
- **Zone**: us-central1-a
- **External IP**: 136.112.148.169 (via ONE_TO_ONE_NAT)
- **Internal IP**: 10.128.0.7
- **Disk**: 80GB persistent boot disk (SCSI interface)
- **OS**: Ubuntu 22.04 LTS (ubuntu-os-cloud)
- **Status**: RUNNING
- **Project**: gen-lang-client-0746582623

## Tags
- agent-zero
- http-server
- https-server

## Shielded VM
- vTPM: enabled
- Integrity Monitoring: enabled
- Secure Boot: disabled

## Service Account
- 912707871123-compute@developer.gserviceaccount.com
- Scopes: devstorage.read_only, logging.write, monitoring.write, pubsub, service.management.readonly, servicecontrol, trace.append

## SSH Access
- Keys configured for: cursor, eshanegross

## Notes
Keep this handy for development tasks involving VM access, deployment, or resource planning.
