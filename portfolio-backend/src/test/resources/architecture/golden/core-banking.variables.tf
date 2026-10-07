# variables.tf — generado desde el lienzo (AWS)

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "api_instance" {
  type    = string
  default = "0.5 vCPU · 1 GB"
}

variable "api_env" {
  type = map(string)
  default = {
    MQ_QUEUE_MANAGER = "QM1"
    MQ_CHANNEL = "APP.SVRCONN"
  }
}