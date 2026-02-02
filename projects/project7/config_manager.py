import os
import yaml
from typing import Any, Dict, Optional

class ConfigManager:
    """
    Manages configuration loading and access for the application.
    """
    def __init__(self, config_path: str = "config.yaml"):
        self.config_path = config_path
        self.config = self._load_config()

    def _load_config(self) -> Dict[str, Any]:
        """Loads configuration from the YAML file."""
        if not os.path.exists(self.config_path):
            print(f"Warning: Config file not found: {self.config_path}")
            return {}
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                conf = yaml.safe_load(f)
                return conf if isinstance(conf, dict) else {}
        except Exception as e:
            print(f"Error loading config: {e}")
            return {}

    def get_section(self, key: str, default: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Retrieves a specific section of the configuration."""
        if default is None:
            default = {}
        section = self.config.get(key, default)
        return section if isinstance(section, dict) else default

    def get_api_key(self) -> Optional[str]:
        """
        Get API key from environment variable or config file.
        Priority: Env Var > Config
        """
        api_key = os.environ.get("DASHSCOPE_API_KEY")
        if api_key:
            return api_key
        
        model_config = self.get_section("model")
        return model_config.get("api_key")
