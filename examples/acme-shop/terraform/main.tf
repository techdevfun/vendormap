# Acme Shop - SYNTHETIC single-vendor fixture
#
# Every layer depends on ONE vendor. `vendormap check` exits 2 here.
# Company name, references and counts are INVENTED to show the rules;
# they are not measurements of any real company.
provider "aws" {
  region = "us-east-1"
}

provider "cloudflare" {
  api_token = "placeholder - never a real token"
}

resource "aws_instance" "web" {
  ami           = "ami-00000000000000000"
  instance_type = "g4dn.xlarge"
}

resource "aws_s3_bucket" "assets" {
  bucket = "acme-shop-assets"
}

resource "aws_db_instance" "main" {
  engine = "postgres"
}

resource "cloudflare_record" "www" {
  zone_id = "00000000000000000000000000000000"
  name    = "www"
  type    = "A"
  value   = "192.0.2.1"
}
