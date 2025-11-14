import logging
import logging.handlers
from pathlib import Path
import os

def setup_logging(log_file="logs/app.log", level=None):
    if level is None:
        level_str = os.getenv("LOG_LEVEL", "INFO")
        level = getattr(logging, level_str, logging.INFO)
    
    Path("logs").mkdir(exist_ok=True)
    
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.handlers.clear()
    
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(level)
    root_logger.addHandler(console_handler)
    
    file_handler = logging.handlers.RotatingFileHandler(
        log_file,
        maxBytes=10485760,
        backupCount=5
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(level)
    root_logger.addHandler(file_handler)
    
    return root_logger
