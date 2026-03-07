"""Token 连通性测试脚本"""

import requests
import os

# 🔧 配置区域
TOKEN = os.getenv("SYNJONES_TOKEN", "bearer yourtoken")  
URL = "https://mcard.sdu.edu.cn/charge/feeitem/getThirdData"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0",
    "Content-Type": "application/x-www-form-urlencoded",
    "Synjones-Auth": TOKEN,
    "Origin": "https://mcard.sdu.edu.cn",
    "Referer": "https://mcard.sdu.edu.cn/"
}

DATA = {
    "type": "select",
    "level": "2",
    "feeitemid": "410",
    "campus": "青岛校区&青岛校区",
    "building": "1503975832&凤凰居1号楼",
    "room": "b111"
}


def test():
    print(f"🔗 测试请求: {URL}")
    print(f"🔑 Token 前30位: {TOKEN[:30]}...")

    try:
        resp = requests.post(URL, headers=HEADERS, data=DATA, timeout=10, verify=True)
        print(f"\n📡 状态码: {resp.status_code}")
        print(f"📦 响应头: {dict(resp.headers)}")
        print(f"📄 响应体: {resp.text[:500]}")

        if resp.status_code == 200:
            data = resp.json()
            if data.get("code") == 200:
                info = data.get("map", {}).get("showData", {}).get("信息", "")
                print(f"\n✅ 测试成功！{info}")
                return True
        elif resp.status_code == 401:
            print("\n❌ 401 Unauthorized → Token 已失效或格式错误")
        elif resp.status_code == 403:
            print("\n❌ 403 Forbidden → 权限不足或 IP 限制")

    except Exception as e:
        print(f"\n💥 请求异常: {type(e).__name__}: {e}")
    return False


if __name__ == "__main__":
    test()