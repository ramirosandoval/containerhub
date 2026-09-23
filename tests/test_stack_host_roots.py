import json
import os
import subprocess
import unittest
from pathlib import Path


STACK = Path(__file__).resolve().parents[1] / "docker-compose.yml"


def rendered_services(storage_root=None):
    environment = {"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", "/nonexistent")}
    if storage_root is not None:
        environment["CONTAINERHUB_STORAGE_ROOT"] = storage_root
    command = ["docker", "compose", "--env-file", "/dev/null", "-f", str(STACK), "config", "--format", "json"]
    rendered = subprocess.run(command, env=environment, text=True, capture_output=True, check=True)
    return json.loads(rendered.stdout)["services"]


class StackHostRootsTest(unittest.TestCase):
    def assert_host_roots(self, storage_root):
        services = rendered_services(storage_root)
        expected_roots = [storage_root or "/storage", "/logs", "/localdata"]
        expected_mounts = {(root, root) for root in expected_roots}
        for service_name in ("containerhub", "containerhub-agent"):
            with self.subTest(service=service_name, storage_root=storage_root):
                service = services[service_name]
                self.assertEqual(service["environment"]["CONTAINERHUB_HOST_VOLUME_ROOTS"], ",".join(expected_roots))
                bind_mounts = {
                    (mount["source"], mount["target"])
                    for mount in service["volumes"] if mount["type"] == "bind"
                }
                self.assertTrue(expected_mounts.issubset(bind_mounts), (service_name, bind_mounts))
        monitoring = services["containerhub-monitoring"]
        self.assertNotIn("CONTAINERHUB_HOST_VOLUME_ROOTS", monitoring["environment"])
        self.assertFalse(any(
            mount["type"] == "bind" and mount["source"] in expected_roots
            for mount in monitoring["volumes"]
        ))

    def test_default_roots(self):
        self.assert_host_roots(None)

    def test_custom_storage_root_preserves_other_roots(self):
        self.assert_host_roots("/srv/containerhub-storage")

    def test_bootstrap_requires_explicit_opt_in_and_identity(self):
        application_environment = rendered_services()["containerhub"]["environment"]
        self.assertEqual(application_environment["CONTAINERHUB_BOOTSTRAP_ENABLED"], "false")
        for variable in (
            "CONTAINERHUB_BOOTSTRAP_NAME",
            "CONTAINERHUB_BOOTSTRAP_USERNAME",
            "CONTAINERHUB_BOOTSTRAP_EMAIL",
            "CONTAINERHUB_BOOTSTRAP_PHONE",
            "CONTAINERHUB_VAULT_BOOTSTRAP_PASSWORD_SECRET_ID",
        ):
            with self.subTest(variable=variable):
                self.assertEqual(application_environment[variable], "")


if __name__ == "__main__":
    unittest.main()
