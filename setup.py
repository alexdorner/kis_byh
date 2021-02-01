# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from setuptools import setup, find_packages
import re, ast,os


# get version from __version__ variable in erpnext/__init__.py
#_version_re = re.compile(r'__version__\s+=\s+(.*)')
#
#with open('requirements.txt') as f:
#	install_requires = f.read().strip().split('\n')

#with open('KIS/__init__.py', 'rb') as f:
#	version = str(ast.literal_eval(_version_re.search(
#		f.read().decode('utf-8')).group(1)))
version = '0.0.1'

setup(
	name='KIS',
	version=version,
	description='KIS',
	author='Frappe Technologies',
	author_email='info@erpnext.com',
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=("frappe",),
)

