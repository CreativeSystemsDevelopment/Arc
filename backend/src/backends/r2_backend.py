"""
Cloudflare R2 Backend for Deep Agents

R2 is S3-compatible with zero egress fees - perfect for skills and memory files.
Get your credentials from: https://dash.cloudflare.com → R2 → Manage R2 API Tokens
"""

import os
from typing import Optional

import boto3
from botocore.exceptions import ClientError


class R2Backend:
    """Cloudflare R2 backend for file storage.
    
    Environment variables:
    - CF_R2_ACCOUNT_ID: Your Cloudflare account ID
    - CF_R2_ACCESS_KEY_ID: R2 access key ID
    - CF_R2_SECRET_ACCESS_KEY: R2 secret access key
    - CF_R2_BUCKET_NAME: Bucket name (default: arc-agent)
    - CF_R2_PUBLIC_URL: (Optional) Custom domain for public access
    """

    def __init__(
        self,
        account_id: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
        prefix: str = "",
    ):
        self.account_id = account_id or os.environ["CF_R2_ACCOUNT_ID"]
        self.bucket_name = bucket_name or os.environ.get("CF_R2_BUCKET_NAME", "arc-agent")
        self.prefix = prefix.strip("/")
        
        # R2 endpoint format: https://<account_id>.r2.cloudflarestorage.com
        endpoint_url = f"https://{self.account_id}.r2.cloudflarestorage.com"
        
        self.s3 = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key or os.environ["CF_R2_ACCESS_KEY_ID"],
            aws_secret_access_key=secret_key or os.environ["CF_R2_SECRET_ACCESS_KEY"],
        )

    def _get_key(self, path: str) -> str:
        """Convert virtual path to R2 key."""
        clean_path = path.lstrip("/")
        if self.prefix:
            return f"{self.prefix}/{clean_path}"
        return clean_path

    def read_file(self, path: str, offset: int = 0, limit: Optional[int] = None) -> str:
        """Read file from R2."""
        key = self._get_key(path)
        try:
            response = self.s3.get_object(Bucket=self.bucket_name, Key=key)
            content = response["Body"].read().decode("utf-8")
            
            if offset or limit:
                lines = content.splitlines()
                selected = lines[offset:offset + limit] if limit else lines[offset:]
                content = "\n".join(selected)
            
            return content
        except ClientError as e:
            if e.response["Error"]["Code"] == "NoSuchKey":
                raise FileNotFoundError(f"File not found: {path}")
            raise

    def write_file(self, path: str, content: str) -> None:
        """Write file to R2."""
        key = self._get_key(path)
        self.s3.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=content.encode("utf-8"),
            ContentType="text/markdown" if path.endswith(".md") else "application/octet-stream",
        )

    def list_directory(self, path: str) -> list[str]:
        """List files in R2 prefix."""
        prefix = self._get_key(path)
        if prefix and not prefix.endswith("/"):
            prefix += "/"
        
        response = self.s3.list_objects_v2(
            Bucket=self.bucket_name,
            Prefix=prefix,
            Delimiter="/",
        )
        
        results = []
        
        # Directories
        for common_prefix in response.get("CommonPrefixes", []):
            dir_name = common_prefix["Prefix"][len(prefix):].rstrip("/")
            if dir_name:
                results.append(f"{path.rstrip('/')}/{dir_name}/")
        
        # Files
        for obj in response.get("Contents", []):
            key = obj["Key"]
            if key != prefix:
                file_name = key[len(prefix):]
                if "/" not in file_name:
                    results.append(f"{path.rstrip('/')}/{file_name}")
        
        return results

    def file_exists(self, path: str) -> bool:
        """Check if file exists in R2."""
        key = self._get_key(path)
        try:
            self.s3.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            raise

    def delete_file(self, path: str) -> None:
        """Delete file from R2."""
        key = self._get_key(path)
        self.s3.delete_object(Bucket=self.bucket_name, Key=key)

    def get_public_url(self, path: str) -> Optional[str]:
        """Get public URL if custom domain is configured."""
        public_url = os.environ.get("CF_R2_PUBLIC_URL")
        if public_url:
            key = self._get_key(path)
            return f"{public_url.rstrip('/')}/{key}"
        return None
