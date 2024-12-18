python3 -m venv .venv

.venv/bin/pip install -r requirements.txt

sudo apt-get install -y libopenblas-dev libgpiod2 vim

scp -r ./local/service user@machine:~

sudo cp -p service/* /etc/systemd/system

sudo systemctl daemon-reload

sudo systemctl start metrics.timer
sudo systemctl enable metrics.timer

sudo systemctl start surf.timer
sudo systemctl enable surf.timer

sudo systemctl start cleanup.timer
sudo systemctl enable cleanup.timer

sudo systemctl start weather.timer
sudo systemctl enable weather.timer

cp -p service/website.service .config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable website
systemctl --user start website


sudo vim /etc/environment