import unittest

from api.fliggy_attractions import adapt_flyai_attraction


class FliggyAttractionAdapterTest(unittest.TestCase):
    def test_preserves_same_item_name_id_and_official_image(self) -> None:
        attraction = adapt_flyai_attraction({
            "id": "1355",
            "name": "颐和园",
            "address": "北京市海淀区新建宫门路19号",
            "latitude": "39.999617",
            "longitude": "116.275179",
            "mainPic": "https://img.alicdn.com/imgextra/summer-palace.jpg",
            "jumpUrl": "https://a.feizhu.com/example",
        })
        self.assertIsNotNone(attraction)
        assert attraction is not None
        self.assertEqual(attraction["id"], "fliggy:1355")
        self.assertEqual(attraction["name"], "颐和园")
        self.assertEqual(attraction["imageUrl"], "https://img.alicdn.com/imgextra/summer-palace.jpg")
        self.assertEqual(attraction["jumpUrl"], "https://a.feizhu.com/example")

    def test_rejects_non_flyai_image_host(self) -> None:
        self.assertIsNone(adapt_flyai_attraction({
            "id": "1355",
            "name": "颐和园",
            "mainPic": "https://example.com/fake.jpg",
        }))


if __name__ == "__main__":
    unittest.main()
