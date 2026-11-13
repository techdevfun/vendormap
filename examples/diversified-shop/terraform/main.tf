# Diversified Shop - SYNTHETIC split-vendor fixture
#
# Every layer is split across TWO vendors. `vendormap check` exits 0 here.
# Company name, references and counts are INVENTED to show the rules;
# they are not measurements of any real company.
provider "aws" {
  region = "us-east-1"
}

provider "google" {
  project = "diversified-shop"
}

provider "cloudflare" {
  api_token = "placeholder - never a real token"
}

resource "aws_s3_bucket" "assets" {
  bucket = "diversified-shop-assets"
}

resource "google_storage_bucket" "backups" {
  name = "diversified-shop-backups"
}
