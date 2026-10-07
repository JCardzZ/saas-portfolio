# variables.tf — generado desde el lienzo (GCP)

variable "region" {
  type    = string
  default = "us-central1"
}

variable "project" {
  type        = string
  description = "Id del proyecto de Google Cloud"
}

variable "api_instance" {
  type    = string
  default = "t3.medium"
}

variable "api_env" {
  type = map(string)
  default = {
    SPRING_PROFILES_ACTIVE = "prod"
    RUTA = "$${HOME} \"x\""
    VACIA = ""
  }
}

variable "api_jwt_secret" {
  type      = string
  sensitive = true
}