import re
from dataclasses import dataclass
from decimal import Decimal

import requests

from app.core.config import settings
from app.models.room import Room


@dataclass
class ElectricityQueryResult:
    success: bool
    balance: Decimal | None = None
    error_kind: str | None = None
    error_msg: str | None = None


class CampusElectricityClient:
    def __init__(self, token_value: str):
        self.token_value = token_value

    def query_room(self, room: Room) -> ElectricityQueryResult:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0",
            "Accept": "*/*",
            "Content-Type": "application/x-www-form-urlencoded",
            "Synjones-Auth": self.token_value,
            "Origin": "https://mcard.sdu.edu.cn",
            "Referer": "https://mcard.sdu.edu.cn/",
            "Connection": "keep-alive",
        }
        data = {
            "type": settings.electricity_api_type,
            "level": settings.electricity_api_level,
            "feeitemid": settings.electricity_api_feeitemid,
            "campus": room.campus_param,
            "building": room.building_param,
            "room": room.room_number,
        }
        try:
            response = requests.post(
                settings.electricity_api_url,
                headers=headers,
                data=data,
                timeout=settings.electricity_api_timeout,
                verify=True,
            )
            if response.status_code in (401, 403):
                return ElectricityQueryResult(False, error_kind="auth", error_msg=f"HTTP {response.status_code}")
            if response.status_code != 200:
                return ElectricityQueryResult(False, error_kind="http", error_msg=f"HTTP {response.status_code}")

            payload = response.json()
            if payload.get("code") != 200:
                return ElectricityQueryResult(
                    False,
                    error_kind="api",
                    error_msg=f"API code={payload.get('code')}, message={payload.get('message') or payload.get('msg')}",
                )

            info_text = payload.get("map", {}).get("showData", {}).get("信息", "")
            if not info_text:
                tipinfo = payload.get("map", {}).get("tipinfo")
                return ElectricityQueryResult(False, error_kind="parse", error_msg=tipinfo or "信息字段为空")

            match = re.search(r"([\d.]+)\s*度", info_text)
            if not match:
                return ElectricityQueryResult(False, error_kind="parse", error_msg=f"无法解析电量：{info_text}")
            return ElectricityQueryResult(True, balance=Decimal(match.group(1)))
        except requests.RequestException as exc:
            return ElectricityQueryResult(False, error_kind="network", error_msg=f"{type(exc).__name__}: {exc}")
        except ValueError as exc:
            return ElectricityQueryResult(False, error_kind="parse", error_msg=f"{type(exc).__name__}: {exc}")
