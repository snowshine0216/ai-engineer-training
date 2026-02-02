import os
import base64

def encode_image(image_path: str) -> str:
    """
    Encodes an image file to a base64 string.

    Args:
        image_path: Path to the image file.
    
    Returns:
        Base64 encoded string of the image.
    
    Raises:
        FileNotFoundError: If the image file does not exist.
    """
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')
