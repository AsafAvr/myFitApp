import json
with open('client_secrets.json', 'r') as f:
    info = json.load(f)
client_secrets_info = json.dumps(info)

with open('.env', 'a') as f:
    f.write(f'CLIENT_SECRETS={client_secrets_info}')

from invoke import run
from honcho.environ import parse

with open('.env', 'r') as f:
    env = parse(f.read())
cmd = 'heroku config:set ' + ' '.join(
    f'{key}=\'{value}\''
    for key, value in env.items()
)
run(cmd)

