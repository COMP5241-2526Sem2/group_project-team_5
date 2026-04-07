from importlib import import_module

lab_service = import_module("app.services.lab.lab_service")

__all__ = ["lab_service"]
