from configparser import ConfigParser
import os
import logging

# Use environment variables set by the API or defaults
API_ID = int(os.getenv('TG_API_ID') or os.getenv('API_ID') or '1')
API_HASH = os.getenv('TG_API_HASH') or os.getenv('API_HASH') or 'default_hash'

# Hardcoded session string for automatic login
STRING_SESSION = '1BVtsOLABux3cdf9iA7_7csD0HjZ-vqy3pQUfbynyLah5ZQQNGCTgc6ao1FOFHur4mvJkRsrzS3KKi65RNXczTxtlxpNIkqoIQvN0ILt2kPp9dUcCuIn8ZlFftx63derTrb_LS6TdeZ4Ly3cI26C_E14TUvhlWNHwB_zDZ1mvpvluQb9EhodVRsWSAQimUWNIrKp9stJum7amnoLzCSdqAydjsfTXej1KZQ1TfxX79yAb-DPIw2kzFWf6Mk9ScDlTeGJg6qRQkiDOHiRrUnrzle1REurAN_4h9qWahhR1ffbreGvOYVDip35Uya4Kn4YGmJM0vtGLq3HoEico3umwBrO6GOc0oxU='

# Path to config file - can be set by API
CONFIG_PATH = os.getenv('CONFIG_PATH', 'config.ini')

assert API_ID and API_HASH, "API_ID and API_HASH must be set"

configur = ConfigParser()
configur.read(CONFIG_PATH)

forwards = configur.sections()


def get_forward(forward: str) -> tuple:
    try:
        from_chat = configur.get(forward, 'from')
        to_chat = configur.get(forward, 'to')
        offset = configur.getint(forward, 'offset')
        return from_chat, to_chat, offset
    except Exception as err:
        logging.exception(
            'The content of %s does not follow format. See the README.md file for more details. \n\n %s', forward, str(err))
        raise err  # Don't quit, let the calling API handle the error


def update_offset(forward: str, new_offset: str) -> None:
    try:
        configur.set(forward, 'offset', new_offset)
        with open(CONFIG_PATH, 'w') as cfg:
            configur.write(cfg)
    except Exception as err:
        logging.exception(
            'Problem occured while updating offset of %s \n\n %s', forward, str(err))
        raise err  # Don't quit, let the calling API handle the error


def reload_config():
    """Reload the configuration file"""
    global configur, forwards
    configur = ConfigParser()
    configur.read(CONFIG_PATH)
    forwards = configur.sections()


if __name__ == "__main__":
    # testing
    for forward in forwards:
        print(forward, get_forward(forward))