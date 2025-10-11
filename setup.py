from setuptools import find_packages, setup

with open("README.md", "r", encoding="utf-8") as f:
    readme = f.read()

setup(
    name="variant_bulk_creation",
    version="0.0.1",
    description="ERPNext helper app to bulk create item variants",
    long_description=readme,
    long_description_content_type="text/markdown",
    author="Custom",
    author_email="support@example.com",
    license="MIT",
    packages=find_packages(),
    include_package_data=True,
    zip_safe=False,
    install_requires=[],
)
