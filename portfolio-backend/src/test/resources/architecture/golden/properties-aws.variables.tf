# variables.tf — generado desde el lienzo (AWS)

variable "region" {
  type    = string
  default = "us-east-1"
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